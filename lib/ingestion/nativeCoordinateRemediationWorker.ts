import { createHash } from 'node:crypto'
import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { applyNativeCoordinateSuccess } from '@/lib/ingestion/spatial/applyNativeCoordinateSuccess'
import {
  isPublishableAddressForNativeRemediation,
  MAX_NATIVE_COORD_REMEDIATION_ATTEMPTS,
} from '@/lib/ingestion/spatial/nativeCoordEligibility'
import { lookupSpatialCoordinates } from '@/lib/ingestion/spatial/resolveSpatialCoordinates'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export type NativeCoordRemediationFailureReason =
  | 'fetch_failed'
  | 'fetch_blocked'
  | 'fetch_rate_limited'
  | 'fetch_captcha'
  | 'not_found'
  | 'no_coords'
  | 'invalid_coords'
  | 'not_publishable_address'
  | 'not_ystm_detail'
  | 'terminal_no_coords'
  | 'terminal_invalid_coords'
  | 'terminal_not_found'
  | 'terminal_fetch_exhausted'

export type NativeCoordinateRemediationSummary = {
  claimed: number
  promoted: number
  cacheHits: number
  retryScheduled: number
  fallbackToGeocode: number
  terminal: number
  skipped: number
  fetchFailed: number
  publishFailed: number
}

interface ClaimedNativeCoordRow {
  id: string
  source_url: string
  address_raw: string | null
  normalized_address: string | null
  city: string | null
  state: string | null
  status: string
  native_coord_attempts: number
  failure_details: unknown
}

function parseBatchSize(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.min(Math.floor(override), 100)
  }
  const raw = process.env.NATIVE_COORD_REMEDIATION_BATCH_SIZE
  const n = raw != null ? Number.parseInt(String(raw), 10) : 75
  if (!Number.isFinite(n) || n < 1) return 75
  return Math.min(n, 100)
}

function parseCooldownMinutes(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) {
    return Math.min(Math.floor(override), 60)
  }
  const raw = process.env.NATIVE_COORD_REMEDIATION_COOLDOWN_MINUTES
  const n = raw != null ? Number.parseInt(String(raw), 10) : 15
  if (!Number.isFinite(n) || n < 0) return 15
  return Math.min(n, 60)
}

function sourceUrlFingerprint(sourceUrl: string): string {
  return createHash('sha256').update(sourceUrl.trim()).digest('hex').slice(0, 16)
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

function classifyFetchFailure(error: unknown): NativeCoordRemediationFailureReason {
  const msg = error instanceof Error ? error.message : String(error)
  if (/http_error:\s*404/i.test(msg)) return 'not_found'
  if (msg.includes('http_error') && /403|429/.test(msg)) {
    return msg.includes('429') ? 'fetch_rate_limited' : 'fetch_blocked'
  }
  if (msg.includes('429')) return 'fetch_rate_limited'
  return 'fetch_failed'
}

function isRetryableFailure(reason: NativeCoordRemediationFailureReason): boolean {
  return (
    reason === 'fetch_failed' ||
    reason === 'fetch_blocked' ||
    reason === 'fetch_rate_limited' ||
    reason === 'fetch_captcha' ||
    reason === 'no_coords' ||
    reason === 'invalid_coords'
  )
}

function terminalReasonForFailure(reason: NativeCoordRemediationFailureReason): NativeCoordRemediationFailureReason {
  switch (reason) {
    case 'invalid_coords':
      return 'terminal_invalid_coords'
    case 'not_found':
      return 'terminal_not_found'
    case 'fetch_failed':
    case 'fetch_blocked':
    case 'fetch_rate_limited':
    case 'fetch_captcha':
      return 'terminal_fetch_exhausted'
    default:
      return 'terminal_no_coords'
  }
}

function computeNativeCoordNextAttemptAt(attempts: number): string {
  const backoffMinutes = [15, 30, 60, 120, 240]
  const idx = Math.min(Math.max(attempts - 1, 0), backoffMinutes.length - 1)
  const minutes = backoffMinutes[idx] ?? 240
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

async function persistNativeCoordOutcome(
  admin: ReturnType<typeof getAdminDb>,
  rowId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await fromBase(admin, 'ingested_sales').update(payload).eq('id', rowId)
  if (error) {
    logger.error('Native coord row update failed', new Error(error.message), {
      component: 'ingestion/nativeCoordinateRemediationWorker',
      operation: 'persist_row',
      rowId,
    })
  }
}

async function fallbackRowToNeedsGeocode(
  admin: ReturnType<typeof getAdminDb>,
  row: ClaimedNativeCoordRow,
  terminalReason: NativeCoordRemediationFailureReason,
  telemetryContext?: Record<string, unknown>
): Promise<void> {
  const update: Record<string, unknown> = {
    native_coord_failure_reason: terminalReason,
    native_coord_next_attempt_at: null,
    native_coord_claimed_at: null,
    native_coord_claimed_by: null,
  }
  if (row.status === 'needs_check') {
    update.status = 'needs_geocode'
  }
  await persistNativeCoordOutcome(admin, row.id, update)
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordFallbackToGeocode, {
      ...(telemetryContext ?? {}),
      rowId: row.id,
      terminalReason,
      priorStatus: row.status,
    })
  )
}

async function processClaimedNativeCoordRow(
  admin: ReturnType<typeof getAdminDb>,
  row: ClaimedNativeCoordRow,
  telemetryContext?: Record<string, unknown>
): Promise<
  | 'promoted'
  | 'cache_hit'
  | 'retry'
  | 'fallback'
  | 'terminal'
  | 'skipped'
  | 'publish_failed'
> {
  const rowId = row.id
  const sourceUrl = row.source_url?.trim() ?? ''
  const city = row.city?.trim() ?? ''
  const state = row.state?.trim() ?? ''
  const addressRaw = row.address_raw != null ? String(row.address_raw) : null
  const urlFingerprint = sourceUrl ? sourceUrlFingerprint(sourceUrl) : null

  if (!isYstmDetailListingUrl(sourceUrl)) {
    await persistNativeCoordOutcome(admin, rowId, {
      native_coord_failure_reason: 'terminal_no_coords',
      native_coord_last_error: 'not_ystm_detail',
    })
    return 'terminal'
  }

  if (!isPublishableAddressForNativeRemediation(addressRaw, city, state)) {
    await persistNativeCoordOutcome(admin, rowId, {
      native_coord_failure_reason: 'terminal_no_coords',
      native_coord_last_error: 'not_publishable_address',
    })
    return 'skipped'
  }

  const priorStatus = row.status === 'needs_check' ? 'needs_check' : 'needs_geocode'

  const cachedOnly = await lookupSpatialCoordinates({
    addressRaw,
    normalizedAddress: row.normalized_address,
    city,
    state,
    sourceUrl,
    pageHtml: null,
    telemetryContext,
  })
  if (cachedOnly) {
    const applied = await applyNativeCoordinateSuccess({
      rowId,
      priorStatus,
      spatial: cachedOnly,
      addressRaw,
      normalizedAddress: row.normalized_address,
      city,
      state,
      telemetryContext,
    })
    if (applied.kind === 'update_failed') return 'skipped'
    return applied.published ? 'cache_hit' : 'publish_failed'
  }

  let html: string
  try {
    html = await fetchSafeExternalPageHtml(sourceUrl, {
      city: city || 'Unknown',
      state: state || 'ZZ',
      pageIndex: 0,
      adapter: 'ystm_native_remediation_2b',
    })
  } catch (e) {
    const reason = classifyFetchFailure(e)
    const attempts = row.native_coord_attempts
    const exhausted = attempts >= MAX_NATIVE_COORD_REMEDIATION_ATTEMPTS
    if (!exhausted && isRetryableFailure(reason)) {
      await persistNativeCoordOutcome(admin, rowId, {
        native_coord_failure_reason: reason,
        native_coord_last_error: reason,
        native_coord_next_attempt_at: computeNativeCoordNextAttemptAt(attempts),
        native_coord_claimed_at: null,
        native_coord_claimed_by: null,
      })
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordRetry, {
          ...(telemetryContext ?? {}),
          rowId,
          urlFingerprint,
          failureReason: reason,
          attempts,
        })
      )
      return 'retry'
    }
    const terminalReason = terminalReasonForFailure(reason)
    await fallbackRowToNeedsGeocode(admin, row, terminalReason, telemetryContext)
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordTerminal, {
        ...(telemetryContext ?? {}),
        rowId,
        urlFingerprint,
        terminalReason,
        attempts,
      })
    )
    return exhausted ? 'fallback' : 'terminal'
  }

  if (isBlockedOrCaptchaHtml(html)) {
    const reason: NativeCoordRemediationFailureReason = 'fetch_captcha'
    const attempts = row.native_coord_attempts
    if (attempts < MAX_NATIVE_COORD_REMEDIATION_ATTEMPTS) {
      await persistNativeCoordOutcome(admin, rowId, {
        native_coord_failure_reason: reason,
        native_coord_last_error: reason,
        native_coord_next_attempt_at: computeNativeCoordNextAttemptAt(attempts),
        native_coord_claimed_at: null,
        native_coord_claimed_by: null,
      })
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordRetry, {
          ...(telemetryContext ?? {}),
          rowId,
          urlFingerprint,
          failureReason: reason,
          attempts,
        })
      )
      return 'retry'
    }
    await fallbackRowToNeedsGeocode(admin, row, 'terminal_fetch_exhausted', telemetryContext)
    return 'fallback'
  }

  const spatial = await lookupSpatialCoordinates({
    addressRaw,
    normalizedAddress: row.normalized_address,
    city,
    state,
    sourceUrl,
    pageHtml: html,
    telemetryContext,
  })

  if (!spatial) {
    const reason: NativeCoordRemediationFailureReason = 'no_coords'
    const attempts = row.native_coord_attempts
    if (attempts < MAX_NATIVE_COORD_REMEDIATION_ATTEMPTS && isRetryableFailure(reason)) {
      await persistNativeCoordOutcome(admin, rowId, {
        native_coord_failure_reason: reason,
        native_coord_last_error: reason,
        native_coord_next_attempt_at: computeNativeCoordNextAttemptAt(attempts),
        native_coord_claimed_at: null,
        native_coord_claimed_by: null,
      })
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordRetry, {
          ...(telemetryContext ?? {}),
          rowId,
          urlFingerprint,
          failureReason: reason,
          attempts,
        })
      )
      return 'retry'
    }
    await fallbackRowToNeedsGeocode(admin, row, 'terminal_no_coords', telemetryContext)
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordTerminal, {
        ...(telemetryContext ?? {}),
        rowId,
        urlFingerprint,
        terminalReason: 'terminal_no_coords',
        attempts,
      })
    )
    return 'fallback'
  }

  const applied = await applyNativeCoordinateSuccess({
    rowId,
    priorStatus,
    spatial,
    addressRaw,
    normalizedAddress: row.normalized_address,
    city,
    state,
    telemetryContext,
  })
  if (applied.kind === 'update_failed') return 'skipped'
  return applied.published ? 'promoted' : 'publish_failed'
}

export async function runNativeCoordinateRemediation(options?: {
  batchSizeOverride?: number
  cooldownMinutesOverride?: number
  claimedBy?: string
  telemetryContext?: Record<string, unknown>
}): Promise<NativeCoordinateRemediationSummary> {
  const admin = getAdminDb()
  const batchSize = parseBatchSize(options?.batchSizeOverride)
  const cooldownMinutes = parseCooldownMinutes(options?.cooldownMinutesOverride)
  const claimedBy = options?.claimedBy ?? 'native_coord_worker'

  const summary: NativeCoordinateRemediationSummary = {
    claimed: 0,
    promoted: 0,
    cacheHits: 0,
    retryScheduled: 0,
    fallbackToGeocode: 0,
    terminal: 0,
    skipped: 0,
    fetchFailed: 0,
    publishFailed: 0,
  }

  const { data, error } = await (admin as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(
    'claim_ingested_sales_for_native_coordinate_remediation',
    {
      p_batch_size: batchSize,
      p_cooldown_minutes: cooldownMinutes,
      p_max_attempts: MAX_NATIVE_COORD_REMEDIATION_ATTEMPTS,
      p_claimed_by: claimedBy,
    }
  )

  if (error) {
    logger.error('Failed to claim rows for native coordinate remediation', new Error(error.message), {
      component: 'ingestion/nativeCoordinateRemediationWorker',
      operation: 'claim_rows',
      batchSize,
    })
    throw error
  }

  const claimedRows = (Array.isArray(data) ? data : []) as ClaimedNativeCoordRow[]
  summary.claimed = claimedRows.length

  if (claimedRows.length > 0) {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordClaimed, {
        ...(options?.telemetryContext ?? {}),
        claimed: claimedRows.length,
        batchSize,
      })
    )
  }

  for (const row of claimedRows) {
    const outcome = await processClaimedNativeCoordRow(admin, row, options?.telemetryContext)
    switch (outcome) {
      case 'promoted':
        summary.promoted += 1
        break
      case 'cache_hit':
        summary.cacheHits += 1
        summary.promoted += 1
        break
      case 'retry':
        summary.retryScheduled += 1
        summary.fetchFailed += 1
        break
      case 'fallback':
        summary.fallbackToGeocode += 1
        break
      case 'terminal':
        summary.terminal += 1
        break
      case 'publish_failed':
        summary.promoted += 1
        summary.publishFailed += 1
        break
      default:
        summary.skipped += 1
        break
    }
  }

  return summary
}
