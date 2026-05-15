import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { extractPublishImageCandidates } from '@/lib/ingestion/publishImageCandidates'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { classifyReconciliationChange } from '@/lib/reconciliation/reconciliationClassifier'
import { orderReconciliationCandidates } from '@/lib/reconciliation/reconciliationSelection'
import { tryParseExternalPageListingForReconciliation } from '@/lib/reconciliation/reconciliationParseSnapshot'
import { resolveSourceRefreshCapability } from '@/lib/reconciliation/reconciliationRefreshCapability'
import {
  emitReconciliationCompleted,
  emitReconciliationRowChanged,
  emitReconciliationRowFailed,
  emitReconciliationRowNoChange,
  emitReconciliationRunSummary,
  emitReconciliationSalesSyncApplied,
  emitReconciliationSalesSyncSkipped,
  emitReconciliationStarted,
  hashHostForReconciliationTelemetry,
} from '@/lib/reconciliation/reconciliationTelemetry'
import { detectPlaceholderListing } from '@/lib/reconciliation/placeholderDetection'
import {
  RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
  buildReconciliationIngestFingerprint,
  type ReconciledScheduleBundleResult,
} from '@/lib/reconciliation/reconciledScheduleBundle'
import {
  computeIngestVsSaleAddressManualReview,
  fingerprintsDifferMaterially,
  reconciliationClassesAllowSafeSaleSync,
  tryApplySafePublishedSaleSyncFromReconciliation,
} from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'
import type {
  IngestFingerprint,
  ReconciliationCandidateRow,
  ReconciliationChangeClass,
  SourceRefreshCapability,
  SourceSyncStatus,
} from '@/lib/reconciliation/types'

const DEFAULT_BATCH_LIMIT = 25
/** Global hard cap for reconciliation batch size (Phase 1B admin runner). */
export const RECONCILIATION_HARD_LIMIT_CAP = 100
const SALES_PREFETCH_CAP = 500

type SalePeekForReconciliation = {
  readonly address: string | null
  readonly city: string | null
  readonly state: string | null
  readonly date_start: string | null
  readonly date_end: string | null
  readonly time_start: string | null
  readonly time_end: string | null
}

type IngestRowDb = {
  id: string
  source_url: string
  source_platform: string
  city: string | null
  state: string | null
  normalized_address: string | null
  zip_code: string | null
  lat: number | null
  lng: number | null
  title: string | null
  description: string | null
  date_start: string | null
  date_end: string | null
  time_start: string | null
  time_end: string | null
  raw_payload: unknown
  image_source_url: string | null
  published_sale_id: string | null
  last_source_sync_at: string | null
  source_sync_status: string | null
  source_sync_attempt_count: number | null
  source_sync_failure_count: number | null
  source_missing_count: number | null
  source_placeholder_detected: boolean | null
  source_content_hash: string | null
  source_schedule_hash: string | null
  source_image_hash: string | null
  status: string
  is_duplicate: boolean | null
  last_source_change_at: string | null
}

function fingerprintFromIngestRow(row: IngestRowDb): IngestFingerprint {
  const images = extractPublishImageCandidates(row.raw_payload, row.image_source_url)
  return buildReconciliationIngestFingerprint({
    title: row.title,
    description: row.description,
    imageUrls: images,
    ingest: {
      date_start: row.date_start,
      date_end: row.date_end,
      time_start: row.time_start,
      time_end: row.time_end,
      raw_payload: row.raw_payload,
    },
    parsed: null,
    sale: null,
    refreshedDescription: row.description,
    priorScheduleHashForFallback: RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
    lat: row.lat,
    lng: row.lng,
  }).fingerprint
}

function priorFingerprintFromRow(row: IngestRowDb): IngestFingerprint {
  if (
    typeof row.source_content_hash === 'string' &&
    row.source_content_hash &&
    typeof row.source_schedule_hash === 'string' &&
    row.source_schedule_hash &&
    typeof row.source_image_hash === 'string' &&
    row.source_image_hash
  ) {
    return {
      contentHash: row.source_content_hash,
      scheduleHash: row.source_schedule_hash,
      imageHash: row.source_image_hash,
    }
  }
  return fingerprintFromIngestRow(row)
}

function toCandidate(row: IngestRowDb): ReconciliationCandidateRow {
  return {
    id: row.id,
    source_url: row.source_url,
    source_platform: row.source_platform,
    city: row.city,
    state: row.state,
    title: row.title,
    description: row.description,
    date_start: row.date_start,
    date_end: row.date_end,
    time_start: row.time_start,
    time_end: row.time_end,
    raw_payload: row.raw_payload,
    image_source_url: row.image_source_url,
    published_sale_id: row.published_sale_id ?? '',
    last_source_sync_at: row.last_source_sync_at,
    source_sync_status: row.source_sync_status,
    source_sync_failure_count: row.source_sync_failure_count ?? 0,
    source_placeholder_detected: Boolean(row.source_placeholder_detected),
    source_content_hash: row.source_content_hash,
    source_schedule_hash: row.source_schedule_hash,
    source_image_hash: row.source_image_hash,
  }
}

function applyCandidateFilters(
  rows: readonly IngestRowDb[],
  opts: { readonly sourcePlatform?: string; readonly onlyPlaceholder?: boolean }
): IngestRowDb[] {
  let out = [...rows]
  if (opts.sourcePlatform && opts.sourcePlatform.trim()) {
    const p = opts.sourcePlatform.trim()
    out = out.filter((r) => r.source_platform === p)
  }
  if (opts.onlyPlaceholder) {
    out = out.filter((r) => {
      if (r.source_placeholder_detected) return true
      const imgs = extractPublishImageCandidates(r.raw_payload, r.image_source_url)
      return detectPlaceholderListing({ description: r.description, imageUrls: imgs }).isPlaceholder
    })
  }
  return out
}

async function loadCandidateIngestRows(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number
): Promise<{ rows: IngestRowDb[]; salePeekBySaleId: ReadonlyMap<string, SalePeekForReconciliation> }> {
  const isoNow = new Date(nowMs).toISOString()
  const { data: saleRows, error: saleErr } = await fromBase(admin, 'sales')
    .select(
      'id, ends_at, ingested_sale_id, moderation_status, address, city, state, date_start, date_end, time_start, time_end'
    )
    .eq('status', 'published')
    .is('archived_at', null)
    .not('ingested_sale_id', 'is', null)
    .or(`ends_at.is.null,ends_at.gt.${isoNow}`)
    .limit(SALES_PREFETCH_CAP)

  if (saleErr || !Array.isArray(saleRows)) {
    logger.warn('reconciliation: failed to load sales for candidate selection', {
      component: 'reconciliation/reconcileExternalSources',
      operation: 'load_sales',
      message: saleErr?.message ?? 'no_rows',
    })
    return { rows: [], salePeekBySaleId: new Map() }
  }

  const eligible = (
    saleRows as Array<{
      id: string
      ingested_sale_id: string | null
      moderation_status: string | null
      address: string | null
      city: string | null
      state: string | null
      date_start: string | null
      date_end: string | null
      time_start: string | null
      time_end: string | null
    }>
  ).filter(
    (s) =>
      s.ingested_sale_id &&
      (s.moderation_status == null || s.moderation_status.trim() === '' || s.moderation_status !== 'hidden_by_admin')
  )

  const ingestIds = [...new Set(eligible.map((s) => s.ingested_sale_id).filter((x): x is string => Boolean(x)))]

  if (ingestIds.length === 0) return { rows: [], salePeekBySaleId: new Map() }

  const salePeekBySaleId = new Map<string, SalePeekForReconciliation>(
    eligible.map((s) => [
      s.id,
      {
        address: s.address ?? null,
        city: s.city ?? null,
        state: s.state ?? null,
        date_start: s.date_start ?? null,
        date_end: s.date_end ?? null,
        time_start: s.time_start ?? null,
        time_end: s.time_end ?? null,
      },
    ])
  )

  const { data: ingestRows, error: ingestErr } = await fromBase(admin, 'ingested_sales')
    .select(
      [
        'id',
        'source_url',
        'source_platform',
        'city',
        'state',
        'normalized_address',
        'zip_code',
        'lat',
        'lng',
        'title',
        'description',
        'date_start',
        'date_end',
        'time_start',
        'time_end',
        'raw_payload',
        'image_source_url',
        'published_sale_id',
        'last_source_sync_at',
        'source_sync_status',
        'source_sync_attempt_count',
        'source_sync_failure_count',
        'source_missing_count',
        'source_placeholder_detected',
        'source_content_hash',
        'source_schedule_hash',
        'source_image_hash',
        'status',
        'is_duplicate',
        'last_source_change_at',
      ].join(', ')
    )
    .in('id', ingestIds)
    .eq('status', 'published')
    .eq('is_duplicate', false)
    .not('source_url', 'is', null)
    .not('published_sale_id', 'is', null)

  if (ingestErr || !Array.isArray(ingestRows)) {
    logger.warn('reconciliation: failed to load ingested_sales candidates', {
      component: 'reconciliation/reconcileExternalSources',
      operation: 'load_ingested',
      message: ingestErr?.message ?? 'no_rows',
    })
    return { rows: [], salePeekBySaleId }
  }

  const saleById = new Map(eligible.map((s) => [s.id, s]))

  const linked = (ingestRows as unknown as IngestRowDb[]).filter((row) => {
    const pub = row.published_sale_id
    if (!pub) return false
    const sale = saleById.get(pub)
    if (!sale || sale.ingested_sale_id !== row.id) return false
    return true
  })

  return { rows: linked, salePeekBySaleId }
}

function resolveSyncStatus(params: {
  readonly parseFailed: boolean
  readonly fetchFailed: boolean
  readonly classes: readonly string[]
}): SourceSyncStatus {
  if (params.fetchFailed) return 'source_missing_soft'
  if (params.parseFailed) return 'parse_failed'
  const materialChange = params.classes.some(
    (c) => c === 'description_changed' || c === 'schedule_changed' || c === 'images_changed' || c === 'placeholder_resolved'
  )
  if (materialChange) return 'changed'
  return 'unchanged'
}

function bumpCapability(cap: SourceRefreshCapability, tallies: Record<SourceRefreshCapability, number>): void {
  tallies[cap] += 1
}

export interface ReconcileExternalSourcesResult {
  readonly attempted: number
  readonly processed: number
  readonly changed: number
  readonly unchanged: number
  readonly failed: number
  readonly parseFailed: number
  readonly sourceMissingSoft: number
  readonly placeholderResolved: number
  readonly unsupportedSource: number
  readonly refreshCapability: {
    readonly serverRefetchSupported: number
    readonly extensionAssistedRequired: number
    readonly unsupportedForReconciliation: number
  }
  readonly persistenceApplied: boolean
  readonly dryRun: boolean
  readonly applySafeSync: boolean
  readonly salesSyncAttempted: number
  readonly salesSyncUpdated: number
  readonly salesSyncSkipped: number
  readonly descriptionsUpdated: number
  readonly imagesUpdated: number
  readonly schedulesUpdated: number
  readonly titlesUpdated: number
  readonly manualReviewRequired: number
}

export interface ReconcileExternalSourcesOptions {
  readonly limit?: number
  readonly nowMs?: number
  readonly telemetryContext?: Record<string, unknown>
  /**
   * When false, persist reconciliation metadata (and Phase 2A `sales` updates when `applySafeSync` is true).
   * Omitted or true: read-only (no `ingested_sales` / `sales` writes). Matches `parseReconciliationRunBody` defaults.
   */
  readonly dryRun?: boolean
  readonly sourcePlatform?: string
  readonly onlyPlaceholder?: boolean
  /**
   * When true, emit only `source.reconciliation.run_summary` (no per-row telemetry).
   * Phase 1B admin runner sets this; leave false for granular diagnostics.
   */
  readonly aggregateTelemetryOnly?: boolean
  /**
   * Phase 2A: when true with `dryRun: false`, apply gated updates to linked public `sales` rows.
   * Default false. Never runs when `dryRun` is omitted or true.
   */
  readonly applySafeSync?: boolean
}

/**
 * Phase 1A–2A external source reconciliation: refetch when server-supported, parse, classify;
 * persist metadata on `ingested_sales`; optional Phase 2A gated updates on linked public `sales`.
 */
export async function reconcileExternalSources(options?: ReconcileExternalSourcesOptions): Promise<ReconcileExternalSourcesResult> {
  const started = Date.now()
  const nowMs = options?.nowMs ?? Date.now()
  const dryRun = options?.dryRun !== false
  const aggregateOnly = options?.aggregateTelemetryOnly === true
  const applySafeSyncRequested = options?.applySafeSync === true
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_BATCH_LIMIT, 1), RECONCILIATION_HARD_LIMIT_CAP)
  const admin = getAdminDb()

  const { rows: rawRows, salePeekBySaleId } = await loadCandidateIngestRows(admin, nowMs)
  const filtered = applyCandidateFilters(rawRows, {
    sourcePlatform: options?.sourcePlatform,
    onlyPlaceholder: options?.onlyPlaceholder,
  })
  const ordered = orderReconciliationCandidates(
    filtered.map(toCandidate),
    nowMs
  )
  const idOrder = new Map(ordered.map((r, i) => [r.id, i]))
  const sortedRows = [...filtered].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
  const attempted = sortedRows.length
  const batch = sortedRows.slice(0, limit)
  const processed = batch.length

  let persistenceWrites = 0

  if (!aggregateOnly) {
    emitReconciliationStarted({
      batchLimit: limit,
      candidateCount: batch.length,
      telemetryContext: options?.telemetryContext,
    })
  }

  let changed = 0
  let unchanged = 0
  let failed = 0
  let parseFailedCount = 0
  let sourceMissingSoftCount = 0
  let placeholderResolvedCount = 0
  let unsupportedSourceCount = 0
  let salesSyncAttempted = 0
  let salesSyncUpdated = 0
  let salesSyncSkipped = 0
  let descriptionsUpdated = 0
  let imagesUpdated = 0
  let schedulesUpdated = 0
  let titlesUpdated = 0
  let manualReviewRequired = 0
  const capTallies: Record<SourceRefreshCapability, number> = {
    server_refetch_supported: 0,
    extension_assisted_required: 0,
    unsupported_for_reconciliation: 0,
  }

  for (const row of batch) {
    const rowStarted = Date.now()
    let hostHash: string | null = null
    try {
      const host = new URL(row.source_url).hostname
      hostHash = hashHostForReconciliationTelemetry(host)
    } catch {
      hostHash = null
    }

    const refreshHost = (() => {
      try {
        return new URL(row.source_url).hostname
      } catch {
        return ''
      }
    })()
    const refreshCapability = resolveSourceRefreshCapability({
      sourcePlatform: row.source_platform,
      sourceHost: refreshHost,
    })
    bumpCapability(refreshCapability, capTallies)
    if (refreshCapability !== 'server_refetch_supported') {
      unsupportedSourceCount += 1
    }

    if (refreshCapability !== 'server_refetch_supported') {
      const priorFp = priorFingerprintFromRow(row)
      const priorImages = extractPublishImageCandidates(row.raw_payload, row.image_source_url)
      const priorPlaceholder = detectPlaceholderListing({
        description: row.description,
        imageUrls: priorImages,
      }).isPlaceholder
      const classification = classifyReconciliationChange({
        priorFingerprint: priorFp,
        nextFingerprint: priorFp,
        priorPlaceholder,
        nextPlaceholder: priorPlaceholder,
      })
      const details = {
        refreshCapability,
        changeClasses: classification.classes,
        primaryChange: classification.primary,
        parseMatched: false,
        skipReason: 'refresh_capability_not_server' as const,
      }
      const status = resolveSyncStatus({ parseFailed: false, fetchFailed: false, classes: classification.classes })
      if (!dryRun) {
        const { error: upErr } = await fromBase(admin, 'ingested_sales')
          .update({
            last_source_sync_at: new Date(nowMs).toISOString(),
            source_reconciliation_details: details,
            source_sync_status: status,
            source_cancelled_detected: false,
          })
          .eq('id', row.id)
        if (upErr) {
          failed += 1
          if (!aggregateOnly) {
            emitReconciliationRowFailed({
              hostHash,
              reason: 'db_update_failed',
              durationMs: Date.now() - rowStarted,
              telemetryContext: options?.telemetryContext,
            })
          }
          continue
        }
        persistenceWrites += 1
      }
      unchanged += 1
      if (!aggregateOnly) {
        emitReconciliationRowNoChange({
          hostHash: hostHash ?? 'unknown',
          durationMs: Date.now() - rowStarted,
          telemetryContext: options?.telemetryContext,
        })
      }
      continue
    }

    const attempts = (row.source_sync_attempt_count ?? 0) + 1
    const priorFp = priorFingerprintFromRow(row)
    const priorImages = extractPublishImageCandidates(row.raw_payload, row.image_source_url)
    const priorPlaceholder = detectPlaceholderListing({
      description: row.description,
      imageUrls: priorImages,
    }).isPlaceholder

    let fetchFailed = false
    let html: string | null = null
    try {
      html = await fetchSafeExternalPageHtml(row.source_url, {
        city: row.city ?? 'Unknown',
        state: row.state ?? 'ZZ',
        pageIndex: 0,
        adapter: 'reconciliation_phase1a',
      })
    } catch {
      fetchFailed = true
    }

    const missingCount = fetchFailed ? (row.source_missing_count ?? 0) + 1 : 0
    const failureCount = fetchFailed ? (row.source_sync_failure_count ?? 0) + 1 : row.source_sync_failure_count ?? 0

    if (fetchFailed || html == null) {
      sourceMissingSoftCount += 1
      const classification = classifyReconciliationChange({
        priorFingerprint: priorFp,
        nextFingerprint: priorFp,
        priorPlaceholder,
        nextPlaceholder: priorPlaceholder,
        sourceMissingSoft: true,
      })
      const status = resolveSyncStatus({
        parseFailed: false,
        fetchFailed: true,
        classes: classification.classes,
      })
      const details = {
        refreshCapability,
        changeClasses: classification.classes,
        primaryChange: classification.primary,
        parseMatched: false,
      }
      if (!dryRun) {
        const { error: upErr } = await fromBase(admin, 'ingested_sales')
          .update({
            last_source_sync_at: new Date(nowMs).toISOString(),
            source_sync_attempt_count: attempts,
            source_sync_failure_count: failureCount,
            source_missing_count: missingCount,
            source_sync_status: status,
            source_reconciliation_details: details,
            source_cancelled_detected: false,
          })
          .eq('id', row.id)

        if (upErr) {
          failed += 1
          if (!aggregateOnly) {
            emitReconciliationRowFailed({
              hostHash,
              reason: 'db_update_failed',
              durationMs: Date.now() - rowStarted,
              telemetryContext: options?.telemetryContext,
            })
          }
          continue
        }
        persistenceWrites += 1
      }

      unchanged += 1
      if (!aggregateOnly) {
        emitReconciliationRowNoChange({
          hostHash: hostHash ?? 'unknown',
          durationMs: Date.now() - rowStarted,
          telemetryContext: options?.telemetryContext,
        })
      }
      continue
    }

    const parsed = tryParseExternalPageListingForReconciliation({
      html,
      sourceUrl: row.source_url,
      city: row.city,
      state: row.state,
      sourcePlatform: row.source_platform,
    })

    const parseFailed = parsed == null
    if (parseFailed) {
      parseFailedCount += 1
    }

    const salePeekSched =
      row.published_sale_id != null ? salePeekBySaleId.get(row.published_sale_id) : undefined
    const saleScheduleForFingerprint =
      salePeekSched != null
        ? {
            date_start: salePeekSched.date_start,
            date_end: salePeekSched.date_end,
            time_start: salePeekSched.time_start,
            time_end: salePeekSched.time_end,
          }
        : null

    let nextScheduleBundle: ReconciledScheduleBundleResult | null = null
    let nextFingerprint: IngestFingerprint
    if (parseFailed) {
      nextFingerprint = priorFp
    } else {
      const fpOut = buildReconciliationIngestFingerprint({
        title: parsed.title,
        description: parsed.description,
        imageUrls: parsed.imageUrls,
        ingest: {
          date_start: row.date_start,
          date_end: row.date_end,
          time_start: row.time_start,
          time_end: row.time_end,
          raw_payload: row.raw_payload,
        },
        parsed,
        sale: saleScheduleForFingerprint,
        refreshedDescription: parsed.description,
        priorScheduleHashForFallback: priorFp.scheduleHash,
        lat: row.lat,
        lng: row.lng,
      })
      nextFingerprint = fpOut.fingerprint
      nextScheduleBundle = fpOut.bundle
    }

    const nextPlaceholder = parseFailed
      ? priorPlaceholder
      : detectPlaceholderListing({
          description: parsed.description,
          imageUrls: parsed.imageUrls,
        }).isPlaceholder

    const classification = classifyReconciliationChange({
      priorFingerprint: priorFp,
      nextFingerprint,
      priorPlaceholder,
      nextPlaceholder,
      parseFailed,
      sourceMissingSoft: false,
    })

    if (classification.classes.includes('placeholder_resolved')) {
      placeholderResolvedCount += 1
    }

    const status = resolveSyncStatus({
      parseFailed,
      fetchFailed: false,
      classes: classification.classes,
    })

    let manualReviewAddr = false
    if (applySafeSyncRequested && !parseFailed && parsed && row.published_sale_id) {
      const peek = salePeekBySaleId.get(row.published_sale_id)
      if (peek) {
        manualReviewAddr = computeIngestVsSaleAddressManualReview({
          ingestNormalizedAddress: row.normalized_address,
          ingestCity: row.city,
          ingestState: row.state,
          saleAddress: peek.address,
          saleCity: peek.city,
          saleState: peek.state,
        })
      }
    }

    const details: Record<string, unknown> = {
      refreshCapability,
      changeClasses: classification.classes,
      primaryChange: classification.primary,
      parseMatched: !parseFailed,
    }
    if (manualReviewAddr) {
      details.manual_review_required = true
      details.manual_review_reason = 'address_drift'
      manualReviewRequired += 1
    }
    if (!parseFailed && nextScheduleBundle && !nextScheduleBundle.ok) {
      details.manual_review_required = true
      if (!manualReviewAddr) {
        details.manual_review_reason = 'schedule_conflict'
      }
      details.schedule_bundle_reason = nextScheduleBundle.schedule_bundle_reason
      manualReviewRequired += 1
    }

    const fingerprintChanged =
      !parseFailed &&
      (priorFp.contentHash !== nextFingerprint.contentHash ||
        priorFp.scheduleHash !== nextFingerprint.scheduleHash ||
        priorFp.imageHash !== nextFingerprint.imageHash)
    const nextLastChangeAt = fingerprintChanged ? new Date(nowMs).toISOString() : row.last_source_change_at

    const nextFailureCount = parseFailed ? (row.source_sync_failure_count ?? 0) + 1 : 0

    if (!dryRun) {
      const { error: upErr } = await fromBase(admin, 'ingested_sales')
        .update({
          last_source_sync_at: new Date(nowMs).toISOString(),
          last_source_change_at: nextLastChangeAt,
          source_sync_attempt_count: attempts,
          source_sync_failure_count: nextFailureCount,
          source_missing_count: 0,
          source_content_hash: nextFingerprint.contentHash,
          source_schedule_hash: nextFingerprint.scheduleHash,
          source_image_hash: nextFingerprint.imageHash,
          source_placeholder_detected: nextPlaceholder,
          source_sync_status: status,
          source_reconciliation_details: details,
          source_cancelled_detected: false,
        })
        .eq('id', row.id)

      if (upErr) {
        failed += 1
        if (!aggregateOnly) {
          emitReconciliationRowFailed({
            hostHash,
            reason: 'db_update_failed',
            durationMs: Date.now() - rowStarted,
            telemetryContext: options?.telemetryContext,
          })
        }
        continue
      }
      persistenceWrites += 1
    }

    const fpDiff = fingerprintsDifferMaterially(priorFp, nextFingerprint)
    const canSalesSync =
      applySafeSyncRequested &&
      !parseFailed &&
      parsed &&
      row.published_sale_id &&
      refreshCapability === 'server_refetch_supported' &&
      reconciliationClassesAllowSafeSaleSync(classification.classes as readonly ReconciliationChangeClass[]) &&
      fpDiff

    if (canSalesSync && row.published_sale_id && nextScheduleBundle) {
      const publishedSaleId = row.published_sale_id
      salesSyncAttempted += 1
      const syncRes = await tryApplySafePublishedSaleSyncFromReconciliation(admin, {
        saleId: publishedSaleId,
        ingestedSaleId: row.id,
        rowId: row.id,
        snapshot: parsed,
        ingest: {
          normalized_address: row.normalized_address,
          zip_code: row.zip_code,
          lat: row.lat,
          lng: row.lng,
          time_start: row.time_start,
          time_end: row.time_end,
          raw_payload: row.raw_payload,
          image_source_url: row.image_source_url,
        },
        classes: classification.classes as readonly ReconciliationChangeClass[],
        priorFingerprint: priorFp,
        nextFingerprint,
        city: row.city,
        state: row.state,
        dryRun,
        nowMs,
        scheduleBundleResult: nextScheduleBundle,
      })
      if (syncRes.outcome === 'updated') {
        salesSyncUpdated += 1
        if (syncRes.descriptionsUpdated) descriptionsUpdated += 1
        if (syncRes.imagesUpdated) imagesUpdated += 1
        if (syncRes.schedulesUpdated) schedulesUpdated += 1
        if (syncRes.titlesUpdated) titlesUpdated += 1
        if (syncRes.mirroredIngestSchedule && !dryRun) {
          persistenceWrites += 1
        }
      } else {
        salesSyncSkipped += 1
      }

      if (syncRes.scheduleMutationInhibited && !dryRun) {
        const mergedDetails: Record<string, unknown> = {
          ...details,
          manual_review_required: true,
          manual_review_reason:
            typeof details.manual_review_reason === 'string' ? details.manual_review_reason : 'schedule_conflict',
          schedule_mutation_inhibited_reason: syncRes.scheduleMutationInhibitedReason ?? 'unknown',
        }
        const { error: detErr } = await fromBase(admin, 'ingested_sales')
          .update({ source_reconciliation_details: mergedDetails })
          .eq('id', row.id)
        if (!detErr) {
          persistenceWrites += 1
          manualReviewRequired += 1
        }
      }
    }

    const isChanged =
      status === 'changed' ||
      classification.classes.some(
        (c) =>
          c === 'description_changed' ||
          c === 'schedule_changed' ||
          c === 'images_changed' ||
          c === 'placeholder_resolved' ||
          c === 'parse_failed'
      )

    if (isChanged) {
      changed += 1
      if (!aggregateOnly) {
        emitReconciliationRowChanged({
          hostHash: hostHash ?? 'unknown',
          primary: classification.primary,
          classCount: classification.classes.length,
          durationMs: Date.now() - rowStarted,
          telemetryContext: options?.telemetryContext,
        })
      }
    } else {
      unchanged += 1
      if (!aggregateOnly) {
        emitReconciliationRowNoChange({
          hostHash: hostHash ?? 'unknown',
          durationMs: Date.now() - rowStarted,
          telemetryContext: options?.telemetryContext,
        })
      }
    }
  }

  const persistenceApplied = !dryRun && persistenceWrites > 0
  const durationMs = Date.now() - started

  if (aggregateOnly) {
    const runMode =
      dryRun ? 'dry_run' : applySafeSyncRequested ? 'persist_metadata_sales_sync' : 'persist_metadata'
    emitReconciliationRunSummary({
      runMode,
      dryRun,
      applySafeSync: applySafeSyncRequested,
      persistenceApplied,
      attempted,
      processed,
      changed,
      unchanged,
      failed,
      parseFailed: parseFailedCount,
      sourceMissingSoft: sourceMissingSoftCount,
      placeholderResolved: placeholderResolvedCount,
      unsupportedSource: unsupportedSourceCount,
      refreshCapabilityServer: capTallies.server_refetch_supported,
      refreshCapabilityExtension: capTallies.extension_assisted_required,
      refreshCapabilityUnsupported: capTallies.unsupported_for_reconciliation,
      salesSyncAttempted,
      salesSyncUpdated,
      salesSyncSkipped,
      descriptionsUpdated,
      imagesUpdated,
      schedulesUpdated,
      titlesUpdated,
      manualReviewRequired,
      durationMs,
      telemetryContext: options?.telemetryContext,
    })
    if (applySafeSyncRequested) {
      if (salesSyncUpdated > 0) {
        emitReconciliationSalesSyncApplied({
          salesSyncUpdated,
          descriptionsUpdated,
          imagesUpdated,
          schedulesUpdated,
          titlesUpdated,
          telemetryContext: options?.telemetryContext,
        })
      }
      if (salesSyncSkipped > 0) {
        emitReconciliationSalesSyncSkipped({
          salesSyncSkipped,
          salesSyncAttempted,
          telemetryContext: options?.telemetryContext,
        })
      }
    }
  } else {
    emitReconciliationCompleted({
      processed: batch.length,
      changed,
      unchanged,
      failed,
      durationMs,
      telemetryContext: options?.telemetryContext,
    })
  }

  return {
    attempted,
    processed,
    changed,
    unchanged,
    failed,
    parseFailed: parseFailedCount,
    sourceMissingSoft: sourceMissingSoftCount,
    placeholderResolved: placeholderResolvedCount,
    unsupportedSource: unsupportedSourceCount,
    refreshCapability: {
      serverRefetchSupported: capTallies.server_refetch_supported,
      extensionAssistedRequired: capTallies.extension_assisted_required,
      unsupportedForReconciliation: capTallies.unsupported_for_reconciliation,
    },
    persistenceApplied,
    dryRun,
    applySafeSync: applySafeSyncRequested,
    salesSyncAttempted,
    salesSyncUpdated,
    salesSyncSkipped,
    descriptionsUpdated,
    imagesUpdated,
    schedulesUpdated,
    titlesUpdated,
    manualReviewRequired,
  }
}
