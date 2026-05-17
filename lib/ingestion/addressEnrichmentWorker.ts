import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { extractDetailPageAddressFromHtml } from '@/lib/ingestion/address/extractDetailPageAddress'
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
import { isAddressGeocodeReady, normalizeAddressLineForIngest } from '@/lib/ingestion/address/addressUsability'
import { enrichStreetLineWithPathMunicipalityWhenNoTail } from '@/lib/ingestion/ystmAddressSlug'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export const INGESTED_ADDRESS_ENRICHMENT_DETAILS_SCHEMA_VERSION = 1 as const

export type AddressEnrichmentWorkerSummary = {
  claimed: number
  succeeded: number
  failedRetriable: number
  failedTerminal: number
  stillGated: number
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
  failure_reasons: unknown
  failure_details: unknown
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

function mergeAddressEnrichmentDetails(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const prior =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  prior.address_enrichment = {
    schema_version: INGESTED_ADDRESS_ENRICHMENT_DETAILS_SCHEMA_VERSION,
    recorded_at: new Date().toISOString(),
    ...patch,
  }
  return prior
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
  telemetryContext?: Record<string, string>
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
    const nextStatus: AddressStatus = isTerminal ? 'address_unavailable_terminal' : 'address_enrichment_retry'
    const nextAt = computeNextEnrichmentAttemptAt(null, now.getTime(), `${canonical}:${attemptCount}`)
    await persistRowAddressOutcome(admin, rowId, {
      address_status: nextStatus,
      next_enrichment_attempt_at: nextAt.toISOString(),
      address_enrichment_failure_reason: reason,
      ...(isTerminal ? { status: 'needs_check' as const } : {}),
      failure_details: mergeAddressEnrichmentDetails(row.failure_details, {
        lastReason: reason,
        attemptCount,
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

  const extracted = extractDetailPageAddressFromHtml({
    html,
    sourceUrl: row.source_url,
    city: row.city,
    state: row.state,
    sourcePlatform: row.source_platform,
  })

  let addressRaw = normalizeAddressLineForIngest(extracted.addressRaw)
  if (addressRaw) {
    const enriched = enrichStreetLineWithPathMunicipalityWhenNoTail(addressRaw, row.source_url)
    addressRaw = enriched.line
  }

  const gatedAfter = detectGatedListing({ sourceUrl: row.source_url, addressRaw })
  if (!addressRaw || !isAddressGeocodeReady(addressRaw) || gatedAfter.gated) {
    const stillGated = gatedAfter.gated || parseSeeSourceUnlockAtFromListingUrl(row.source_url) != null
    if (stillGated && !isAddressGeocodeReady(addressRaw)) {
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
      address_status: terminal ? 'address_unavailable_terminal' : 'address_enrichment_retry',
      next_enrichment_attempt_at: nextAt?.toISOString() ?? null,
      address_enrichment_failure_reason: reason,
      status: 'needs_check',
      failure_details: mergeAddressEnrichmentDetails(row.failure_details, {
        lastReason: reason,
        attemptCount,
      }),
    })
    return { outcome: terminal ? 'terminal' : 'retriable', reason }
  }

  const normalized = addressRaw.toLowerCase().replace(/\s+/g, ' ')
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
    }),
  })

  if (!ok) {
    return { outcome: 'retriable', reason: 'fetch_failed' }
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.addressEnrichmentRow, {
      ...(telemetryContext ?? {}),
      outcome: 'ok',
      attemptCount,
    })
  )
  return { outcome: 'ok' }
}

export async function enrichPendingAddresses(options?: {
  batchSizeOverride?: number
  cooldownMinutesOverride?: number
  telemetryContext?: Record<string, string>
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
    byFailureReason: {},
  }

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
