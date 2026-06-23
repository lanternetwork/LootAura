import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { extractDetailPageListingEnrichmentFromHtml } from '@/lib/ingestion/address/extractDetailPageListingEnrichment'
import {
  ADDRESS_NOT_FOUND_TERMINAL_THRESHOLD,
  MAX_ADDRESS_ENRICHMENT_ATTEMPTS,
  type AddressEnrichmentFailureReason,
  type AddressStatus,
} from '@/lib/ingestion/address/addressLifecycleTypes'
import {
  computeNextEnrichmentAttemptAt,
  detectGatedListing,
  parseSeeSourceUnlockAtFromListingUrl,
} from '@/lib/ingestion/address/addressGated'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import { applyDetailPageImageEnrichment } from '@/lib/ingestion/images/applyDetailPageImageEnrichment'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { promoteIngestedSaleCoordinates } from '@/lib/ingestion/spatial/promoteIngestedSaleCoordinates'
import { lookupSpatialCoordinates } from '@/lib/ingestion/spatial/resolveSpatialCoordinates'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

import { mergeAddressEnrichmentDetails } from '@/lib/ingestion/address/addressEnrichmentFailureDetails'
import {
  isUnlockScheduledInFuture,
  resolveEnrichmentAddressCandidate,
} from '@/lib/ingestion/address/resolveEnrichmentAddressCandidate'
import { archiveCooledTerminalAddressDisposition } from '@/lib/ingestion/address/archiveTerminalAddressDisposition'
import { reconcileExhaustedAddressEnrichmentPending } from '@/lib/ingestion/address/reconcileExhaustedAddressEnrichmentPending'
import { reconcileAddressEnrichmentOwnedNeedsCheck } from '@/lib/ingestion/address/reconcileAddressEnrichmentOwnedNeedsCheck'
import { reconcileScheduleGatedAddressEnrichmentPending } from '@/lib/ingestion/address/reconcileScheduleGatedAddressEnrichmentPending'
import { terminalActiveAddressStatusForEntry } from '@/lib/ingestion/address/terminalAddressDisposition'

export { INGESTED_ADDRESS_ENRICHMENT_DETAILS_SCHEMA_VERSION } from '@/lib/ingestion/address/addressEnrichmentFailureDetails'

export type AddressEnrichmentWorkerSummary = {
  claimed: number
  succeeded: number
  failedRetriable: number
  failedTerminal: number
  stillGated: number
  exhaustedReconciled: number
  scheduleGatedReconciled: number
  enrichmentOwnedReclassifiedPending: number
  enrichmentOwnedTerminalized: number
  terminalArchived: number
  byFailureReason: Partial<Record<AddressEnrichmentFailureReason, number>>
}

interface ClaimedAddressEnrichmentRow {
  id: string
  source_platform: string
  canonical_source_url: string | null
  source_url: string
  city: string | null
  state: string | null
  address_enrichment_attempts: number
  address_unlock_at: string | null
  image_source_url?: string | null
  failure_reasons: unknown
  failure_details: unknown
  raw_payload?: unknown
}

function parseBatchSize(): number {
  const raw = process.env.ADDRESS_ENRICHMENT_BACKLOG_BATCH_SIZE
  const n = raw != null ? Number.parseInt(String(raw), 10) : 25
  if (!Number.isFinite(n) || n < 1) return 25
  return Math.min(n, 100)
}

function isBlockedOrCaptchaHtml(html: string): boolean {
  const sample = html.slice(0, 8000).toLowerCase()
  return (
    sample.includes('captcha') ||
    sample.includes('cf-browser-verification') ||
    sample.includes('attention required') ||
    sample.includes('access denied') ||
    sample.includes('rate limit')
  )
}

function classifyFetchFailure(error: unknown): AddressEnrichmentFailureReason {
  const msg = error instanceof Error ? error.message : String(error)
  if (/http_error:\s*404/i.test(msg)) return 'not_found'
  if (msg.includes('http_error') && /403|429/.test(msg)) {
    return msg.includes('429') ? 'fetch_rate_limited' : 'fetch_blocked'
  }
  if (msg.includes('429')) return 'fetch_rate_limited'
  return 'fetch_failed'
}

async function persistRowAddressOutcome(
  admin: ReturnType<typeof getAdminDb>,
  rowId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update(payload)
    .eq('id', rowId)
    .select('id')
    .maybeSingle()
  if (error) {
    logger.error('Address enrichment row update failed', new Error(error.message), {
      component: 'ingestion/addressEnrichmentWorker',
      operation: 'persist_row',
      rowId,
    })
    return false
  }
  return Boolean(data?.id)
}

async function processAddressEnrichmentRow(
  admin: ReturnType<typeof getAdminDb>,
  row: ClaimedAddressEnrichmentRow,
  telemetryContext?: Record<string, unknown>
): Promise<{
  outcome: 'ok' | 'retriable' | 'terminal' | 'still_gated'
  reason?: AddressEnrichmentFailureReason
}> {
  const rowId = row.id
  const attemptCount = row.address_enrichment_attempts
  const canonical = row.canonical_source_url ?? canonicalSourceUrl(row.source_url)
  const now = new Date()
  const unlockAt =
    row.address_unlock_at != null
      ? new Date(row.address_unlock_at)
      : parseSeeSourceUnlockAtFromListingUrl(row.source_url)

  if (unlockAt && unlockAt.getTime() > now.getTime()) {
    const nextAt = computeNextEnrichmentAttemptAt(unlockAt, now.getTime(), canonical)
    await persistRowAddressOutcome(admin, rowId, {
      address_status: 'address_gated',
      address_unlock_at: unlockAt.toISOString(),
      next_enrichment_attempt_at: nextAt.toISOString(),
      address_enrichment_failure_reason: 'still_gated',
      failure_details: mergeAddressEnrichmentDetails(row.failure_details, {
        lastReason: 'still_gated',
        attemptCount,
      }),
    })
    return { outcome: 'still_gated', reason: 'still_gated' }
  }

  let html: string
  try {
    html = await fetchSafeExternalPageHtml(row.source_url, {
      city: row.city ?? 'Unknown',
      state: row.state ?? 'ZZ',
      pageIndex: 0,
      adapter: 'address_enrichment_d1',
    })
  } catch (e) {
    const reason = classifyFetchFailure(e)
    const isTerminal =
      attemptCount >= MAX_ADDRESS_ENRICHMENT_ATTEMPTS ||
      (reason === 'not_found' && attemptCount >= ADDRESS_NOT_FOUND_TERMINAL_THRESHOLD)
    const nextStatus: AddressStatus = isTerminal
      ? terminalActiveAddressStatusForEntry()
      : 'address_enrichment_retry'
    const nextAt = computeNextEnrichmentAttemptAt(null, now.getTime(), `${canonical}:${attemptCount}`)
    await persistRowAddressOutcome(admin, rowId, {
      address_status: nextStatus,
      next_enrichment_attempt_at: nextAt.toISOString(),
      address_enrichment_failure_reason: reason,
      ...(isTerminal ? { status: 'needs_check' as const } : {}),
      failure_details: mergeAddressEnrichmentDetails(row.failure_details, {
        lastReason: reason,
        attemptCount,
        ...(isTerminal ? { recordTerminalEntry: true } : {}),
      }),
    })
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.addressEnrichmentRow, {
        ...(telemetryContext ?? {}),
        outcome: isTerminal ? 'terminal' : 'retriable',
        failureReason: reason,
        attemptCount,
      })
    )
    return { outcome: isTerminal ? 'terminal' : 'retriable', reason }
  }

  if (isBlockedOrCaptchaHtml(html)) {
    const nextAt = computeNextEnrichmentAttemptAt(null, now.getTime(), `${canonical}:blocked:${attemptCount}`)
    await persistRowAddressOutcome(admin, rowId, {
      address_status: 'address_enrichment_retry',
      next_enrichment_attempt_at: nextAt.toISOString(),
      address_enrichment_failure_reason: 'fetch_blocked',
      failure_details: mergeAddressEnrichmentDetails(row.failure_details, {
        lastReason: 'fetch_blocked',
        attemptCount,
      }),
    })
    return { outcome: 'retriable', reason: 'fetch_blocked' }
  }

  await applyDetailPageImageEnrichment({
    rowId,
    sourceUrl: row.source_url,
    html,
    existingImageSourceUrl: row.image_source_url,
    existingRawPayload: row.raw_payload,
    existingFailureDetails: row.failure_details,
    attemptCount,
    detailAttemptSource: 'address_enrichment',
    telemetryContext,
    city: row.city,
    state: row.state,
  })

  const enrichment = extractDetailPageListingEnrichmentFromHtml({
    html,
    sourceUrl: row.source_url,
    city: row.city,
    state: row.state,
  })

  const resolvedAddress = resolveEnrichmentAddressCandidate({
    detailPageAddressRaw: enrichment?.addressRaw,
    sourceUrl: row.source_url,
    nowMs: now.getTime(),
  })
  const addressRaw = resolvedAddress.addressRaw

  const gatedAfter = detectGatedListing({ sourceUrl: row.source_url, addressRaw })
  const unlockInFuture = isUnlockScheduledInFuture({
    sourceUrl: row.source_url,
    addressUnlockAt: row.address_unlock_at,
    nowMs: now.getTime(),
  })

  if (!addressRaw || !isAddressGeocodeReady(addressRaw) || gatedAfter.gated) {
    if (unlockInFuture && !isAddressGeocodeReady(addressRaw)) {
      const nextUnlock = gatedAfter.unlockAt ?? parseSeeSourceUnlockAtFromListingUrl(row.source_url)
      const nextAt = computeNextEnrichmentAttemptAt(nextUnlock, now.getTime(), canonical)
      await persistRowAddressOutcome(admin, rowId, {
        address_status: nextUnlock && nextUnlock.getTime() > now.getTime() ? 'address_gated' : 'address_enrichment_retry',
        address_unlock_at: nextUnlock?.toISOString() ?? row.address_unlock_at,
        next_enrichment_attempt_at: nextAt.toISOString(),
        address_enrichment_failure_reason: 'still_gated',
        failure_details: mergeAddressEnrichmentDetails(row.failure_details, {
          lastReason: 'still_gated',
          attemptCount,
        }),
      })
      return { outcome: 'still_gated', reason: 'still_gated' }
    }

    const reason: AddressEnrichmentFailureReason =
      attemptCount >= MAX_ADDRESS_ENRICHMENT_ATTEMPTS ? 'max_attempts_exceeded' : 'parse_no_address'
    const terminal = reason === 'max_attempts_exceeded'
    const nextAt = terminal ? null : computeNextEnrichmentAttemptAt(null, now.getTime(), `${canonical}:parse:${attemptCount}`)
    await persistRowAddressOutcome(admin, rowId, {
      address_status: terminal ? terminalActiveAddressStatusForEntry() : 'address_enrichment_retry',
      next_enrichment_attempt_at: nextAt?.toISOString() ?? null,
      address_enrichment_failure_reason: reason,
      status: 'needs_check',
      failure_details: mergeAddressEnrichmentDetails(row.failure_details, {
        lastReason: reason,
        attemptCount,
        ...(resolvedAddress.source ? { resolvedAddressSource: resolvedAddress.source } : {}),
        ...(terminal ? { recordTerminalEntry: true } : {}),
      }),
    })
    return { outcome: terminal ? 'terminal' : 'retriable', reason }
  }

  const normalized = addressRaw.toLowerCase().replace(/\s+/g, ' ')
  const city = row.city?.trim() ?? ''
  const state = row.state?.trim() ?? ''
  const spatial = await lookupSpatialCoordinates({
    addressRaw,
    normalizedAddress: normalized,
    city,
    state,
    sourceUrl: row.source_url,
    pageHtml: html,
    telemetryContext,
  })

  const ok = await persistRowAddressOutcome(admin, rowId, {
    address_raw: addressRaw,
    normalized_address: normalized,
    address_status: 'address_available',
    address_unlock_at: null,
    next_enrichment_attempt_at: null,
    address_enrichment_failure_reason: null,
    status: 'needs_geocode',
    failure_details: mergeAddressEnrichmentDetails(row.failure_details, {
      lastReason: 'success',
      attemptCount,
      ...(enrichment?.chosenAddressSource
        ? { chosenAddressSource: enrichment.chosenAddressSource }
        : {}),
      ...(resolvedAddress.source ? { resolvedAddressSource: resolvedAddress.source } : {}),
    }),
  })

  if (!ok) {
    return { outcome: 'retriable', reason: 'fetch_failed' }
  }

  if (spatial) {
    const promoted = await promoteIngestedSaleCoordinates(rowId, spatial.lat, spatial.lng, {
      geocode_confidence: spatial.geocode_confidence,
      coordinate_precision: spatial.coordinate_precision,
      geocode_method: spatial.geocode_method,
    })
    if (promoted.kind === 'update_failed') {
      return { outcome: 'retriable', reason: 'fetch_failed' }
    }
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.addressEnrichmentRow, {
      ...(telemetryContext ?? {}),
      outcome: 'ok',
      attemptCount,
      spatialPromoted: Boolean(spatial),
    })
  )
  return { outcome: 'ok' }
}

export async function enrichPendingAddresses(options?: {
  batchSizeOverride?: number
  cooldownMinutesOverride?: number
  telemetryContext?: Record<string, unknown>
}): Promise<AddressEnrichmentWorkerSummary> {
  const admin = getAdminDb()
  const batchSize =
    typeof options?.batchSizeOverride === 'number' && options.batchSizeOverride > 0
      ? Math.min(Math.floor(options.batchSizeOverride), 100)
      : parseBatchSize()
  const cooldownMinutes =
    typeof options?.cooldownMinutesOverride === 'number' && options.cooldownMinutesOverride >= 0
      ? Math.min(Math.floor(options.cooldownMinutesOverride), 60)
      : 15

  const summary: AddressEnrichmentWorkerSummary = {
    claimed: 0,
    succeeded: 0,
    failedRetriable: 0,
    failedTerminal: 0,
    stillGated: 0,
    exhaustedReconciled: 0,
    scheduleGatedReconciled: 0,
    enrichmentOwnedReclassifiedPending: 0,
    enrichmentOwnedTerminalized: 0,
    terminalArchived: 0,
    byFailureReason: {},
  }

  const archiveSummary = await archiveCooledTerminalAddressDisposition({
    batchSize: Math.max(batchSize * 4, 100),
  })
  summary.terminalArchived = archiveSummary.archived

  const scheduleGatedSummary = await reconcileScheduleGatedAddressEnrichmentPending({
    batchSize: Math.max(batchSize * 4, 100),
    cooldownMinutes,
  })
  summary.scheduleGatedReconciled = scheduleGatedSummary.reconciled

  const reconcileSummary = await reconcileExhaustedAddressEnrichmentPending({
    batchSize: Math.max(batchSize * 4, 100),
  })
  summary.exhaustedReconciled = reconcileSummary.reconciled

  const enrichmentOwnedSummary = await reconcileAddressEnrichmentOwnedNeedsCheck({
    batchSize: Math.max(batchSize * 4, 100),
    cooldownMinutes,
  })
  summary.enrichmentOwnedReclassifiedPending = enrichmentOwnedSummary.reclassifiedPending
  summary.enrichmentOwnedTerminalized = enrichmentOwnedSummary.terminalized

  const { data, error } = await (admin as any).rpc('claim_ingested_sales_for_address_enrichment', {
    p_batch_size: batchSize,
    p_cooldown_minutes: cooldownMinutes,
  })

  if (error) {
    logger.error('Failed to claim rows for address enrichment', new Error(error.message), {
      component: 'ingestion/addressEnrichmentWorker',
      operation: 'claim_rows',
      batchSize,
    })
    throw new Error(error.message)
  }

  const claimed = (Array.isArray(data) ? data : []) as ClaimedAddressEnrichmentRow[]
  summary.claimed = claimed.length

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.addressEnrichmentBatchStarted, {
      ...(options?.telemetryContext ?? {}),
      batchSize,
      claimed: summary.claimed,
    })
  )

  for (const row of claimed) {
    const result = await processAddressEnrichmentRow(admin, row, options?.telemetryContext)
    if (result.reason) {
      summary.byFailureReason[result.reason] = (summary.byFailureReason[result.reason] ?? 0) + 1
    }
    if (result.outcome === 'ok') summary.succeeded += 1
    else if (result.outcome === 'still_gated') summary.stillGated += 1
    else if (result.outcome === 'terminal') summary.failedTerminal += 1
    else summary.failedRetriable += 1
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.addressEnrichmentBatchCompleted, {
      ...(options?.telemetryContext ?? {}),
      ...summary,
    })
  )

  logger.info('Address enrichment batch completed', {
    component: 'ingestion/addressEnrichmentWorker',
    operation: 'batch_complete',
    ...summary,
  })

  return summary
}
