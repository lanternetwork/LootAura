import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { extractPublishImageCandidates } from '@/lib/ingestion/publishWorker'
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
  emitReconciliationStarted,
  hashHostForReconciliationTelemetry,
} from '@/lib/reconciliation/reconciliationTelemetry'
import { detectPlaceholderListing } from '@/lib/reconciliation/placeholderDetection'
import { fingerprintFromParts } from '@/lib/reconciliation/sourceHashing'
import type { IngestFingerprint, ReconciliationCandidateRow, SourceSyncStatus } from '@/lib/reconciliation/types'

const DEFAULT_BATCH_LIMIT = 25
const SALES_PREFETCH_CAP = 500

type IngestRowDb = {
  id: string
  source_url: string
  source_platform: string
  city: string | null
  state: string | null
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

function listingTimezoneFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const z = (raw as { listing_timezone?: unknown }).listing_timezone
  return typeof z === 'string' && z.trim() ? z.trim() : null
}

function fingerprintFromIngestRow(row: IngestRowDb): IngestFingerprint {
  const images = extractPublishImageCandidates(row.raw_payload, row.image_source_url)
  return fingerprintFromParts({
    title: row.title,
    description: row.description,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    listingTimezone: listingTimezoneFromRaw(row.raw_payload),
    imageUrls: images,
  })
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

async function loadCandidateIngestRows(admin: ReturnType<typeof getAdminDb>, nowMs: number): Promise<IngestRowDb[]> {
  const isoNow = new Date(nowMs).toISOString()
  const { data: saleRows, error: saleErr } = await fromBase(admin, 'sales')
    .select('id, ends_at, ingested_sale_id, moderation_status')
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
    return []
  }

  const eligible = (saleRows as Array<{ id: string; ingested_sale_id: string | null; moderation_status: string | null }>).filter(
    (s) =>
      s.ingested_sale_id &&
      (s.moderation_status == null || s.moderation_status.trim() === '' || s.moderation_status !== 'hidden_by_admin')
  )

  const ingestIds = [...new Set(eligible.map((s) => s.ingested_sale_id).filter((x): x is string => Boolean(x)))]

  if (ingestIds.length === 0) return []

  const { data: ingestRows, error: ingestErr } = await fromBase(admin, 'ingested_sales')
    .select(
      [
        'id',
        'source_url',
        'source_platform',
        'city',
        'state',
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
    return []
  }

  const saleById = new Map(eligible.map((s) => [s.id, s]))

  const linked = (ingestRows as unknown as IngestRowDb[]).filter((row) => {
    const pub = row.published_sale_id
    if (!pub) return false
    const sale = saleById.get(pub)
    if (!sale || sale.ingested_sale_id !== row.id) return false
    return true
  })

  return linked
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

export interface ReconcileExternalSourcesResult {
  readonly processed: number
  readonly changed: number
  readonly unchanged: number
  readonly failed: number
}

export interface ReconcileExternalSourcesOptions {
  readonly limit?: number
  readonly nowMs?: number
  readonly telemetryContext?: Record<string, unknown>
}

/**
 * Phase 1A detection-only reconciliation: refetch, parse, hash, classify, persist metadata on ingested_sales only.
 */
export async function reconcileExternalSources(options?: ReconcileExternalSourcesOptions): Promise<ReconcileExternalSourcesResult> {
  const started = Date.now()
  const nowMs = options?.nowMs ?? Date.now()
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_BATCH_LIMIT, 1), 200)
  const admin = getAdminDb()

  const rawRows = await loadCandidateIngestRows(admin, nowMs)
  const ordered = orderReconciliationCandidates(
    rawRows.map(toCandidate),
    nowMs
  )
  const idOrder = new Map(ordered.map((r, i) => [r.id, i]))
  const sortedRows = [...rawRows].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
  const batch = sortedRows.slice(0, limit)

  emitReconciliationStarted({
    batchLimit: limit,
    candidateCount: batch.length,
    telemetryContext: options?.telemetryContext,
  })

  let changed = 0
  let unchanged = 0
  let failed = 0

  for (const row of batch) {
    const rowStarted = Date.now()
    let hostHash: string | null = null
    try {
      const host = new URL(row.source_url).hostname
      hostHash = hashHostForReconciliationTelemetry(host)
    } catch {
      hostHash = null
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
      const details = {
        refreshCapability,
        changeClasses: classification.classes,
        primaryChange: classification.primary,
        parseMatched: false,
      }
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
        emitReconciliationRowFailed({
          hostHash,
          reason: 'db_update_failed',
          durationMs: Date.now() - rowStarted,
          telemetryContext: options?.telemetryContext,
        })
        continue
      }

      unchanged += 1
      emitReconciliationRowNoChange({
        hostHash: hostHash ?? 'unknown',
        durationMs: Date.now() - rowStarted,
        telemetryContext: options?.telemetryContext,
      })
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
    const nextFingerprint = parseFailed
      ? priorFp
      : fingerprintFromParts({
          title: parsed.title,
          description: parsed.description,
          dateStart: parsed.dateStart ?? row.date_start,
          dateEnd: parsed.dateEnd ?? row.date_end,
          timeStart: row.time_start,
          timeEnd: row.time_end,
          listingTimezone: listingTimezoneFromRaw(row.raw_payload),
          imageUrls: parsed.imageUrls,
        })

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

    const status = resolveSyncStatus({
      parseFailed,
      fetchFailed: false,
      classes: classification.classes,
    })

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

    const details = {
      refreshCapability,
      changeClasses: classification.classes,
      primaryChange: classification.primary,
      parseMatched: !parseFailed,
    }

    const fingerprintChanged =
      !parseFailed &&
      (priorFp.contentHash !== nextFingerprint.contentHash ||
        priorFp.scheduleHash !== nextFingerprint.scheduleHash ||
        priorFp.imageHash !== nextFingerprint.imageHash)
    const nextLastChangeAt = fingerprintChanged ? new Date(nowMs).toISOString() : row.last_source_change_at

    const nextFailureCount = parseFailed ? (row.source_sync_failure_count ?? 0) + 1 : 0

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
      emitReconciliationRowFailed({
        hostHash,
        reason: 'db_update_failed',
        durationMs: Date.now() - rowStarted,
        telemetryContext: options?.telemetryContext,
      })
      continue
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
      emitReconciliationRowChanged({
        hostHash: hostHash ?? 'unknown',
        primary: classification.primary,
        classCount: classification.classes.length,
        durationMs: Date.now() - rowStarted,
        telemetryContext: options?.telemetryContext,
      })
    } else {
      unchanged += 1
      emitReconciliationRowNoChange({
        hostHash: hostHash ?? 'unknown',
        durationMs: Date.now() - rowStarted,
        telemetryContext: options?.telemetryContext,
      })
    }
  }

  emitReconciliationCompleted({
    processed: batch.length,
    changed,
    unchanged,
    failed,
    durationMs: Date.now() - started,
    telemetryContext: options?.telemetryContext,
  })

  return { processed: batch.length, changed, unchanged, failed }
}
