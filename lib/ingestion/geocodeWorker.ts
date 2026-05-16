import { emitObservabilityRecord, buildTelemetryRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import { classifyQueuePressure } from '@/lib/observability/metrics'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import {
  geocodeAddress,
  type GeocodeAddressOutcome,
  type GeocodeMode,
} from '@/lib/geocode/geocodeAddress'
import {
  classifyProviderHealth,
  defaultProviderHealthThresholds,
  type ProviderHealthDecision,
  type ProviderHealthSignals,
} from '@/lib/geocode/providerHealth'
import {
  buildGeocodeDeadLetterEnvelope,
  carryOverReplayFieldsOntoDeadLetterEnvelope,
  classifyGeocodeTerminalDeadLetter,
  defaultGeocodeDeadLetterThresholds,
  extractPriorDeadLetterClassificationCount,
  mergeGeocodeDeadLetterIntoFailureDetails,
  type GeocodeDeadLetterEnvelope,
} from '@/lib/geocode/deadLetter'
import { stripUnitDesignatorFromAddressLineForGeocode } from '@/lib/geocode/stripUnitDesignatorForGeocode'
import { logger } from '@/lib/log'
import { normalizeLocalityForGeocodeQuery } from '@/lib/ingestion/normalizeIngestionLocation'
import {
  buildGeocodeAttemptPlan,
  primaryAndFallbackCitiesEquivalent,
} from '@/lib/ingestion/geocodeAttemptPlan'
import { publishReadyIngestedSaleById, type PublishReadyByIdResult } from '@/lib/ingestion/publishWorker'
import type { FailureReason } from '@/lib/ingestion/types'

/** Sub-key on `ingested_sales.failure_details` for last geocode attempt diagnostics (no raw address / full geocode query). */
export const INGESTED_GEOCODE_FAILURE_DETAILS_SCHEMA_VERSION = 1 as const
export const INGESTED_GEOCODE_FAILURE_DETAILS_SCHEMA_VERSION_V2 = 2 as const

export type GeocodeAttemptStrategy = GeocodeMode | 'unit_stripped'

export type GeocodeAttemptDiagnostic = {
  strategy: GeocodeAttemptStrategy
  queryStrategy: 'minimal_locality' | 'normalize_locality'
  addressSource: string
  municipalitySource: string
  fallbackArbitrationApplied: boolean
  /** Non-PII hint only; full geocode query must never be persisted. */
  queryCharLength?: number
  queryFingerprint?: string
  resultType:
    | 'success'
    | 'empty_results'
    | 'ambiguous'
    | 'cross_state'
    | 'timeout'
    | 'rate_limited'
    | 'low_confidence'
    | 'http_error'
    | 'invalid_coordinates'
    | 'fetch_exception'
    | 'empty_input'
}

export type IngestedGeocodeFailureDetailsV1 = {
  schema_version: typeof INGESTED_GEOCODE_FAILURE_DETAILS_SCHEMA_VERSION
  recorded_at: string
  attemptCount: number
  providerClassification: string
  noCoordsReason?: string
  queryFingerprint?: string
  lowConfidenceReasons?: Array<'low_importance' | 'broad_match' | 'city_mismatch' | 'state_mismatch'>
  geocode_city_raw: string | null
  geocode_city_normalized: string | null
  httpStatus?: number
}

export function buildIngestedGeocodeFailureDetailsV1(
  attemptCount: number,
  geo: GeocodeAddressOutcome,
  fallbackCityTrimmed: string
): IngestedGeocodeFailureDetailsV1 {
  const raw = (geo.geocodeCityRaw ?? fallbackCityTrimmed).trim()
  const norm = geo.geocodeCityNormalized?.trim()
  return {
    schema_version: INGESTED_GEOCODE_FAILURE_DETAILS_SCHEMA_VERSION,
    recorded_at: new Date().toISOString(),
    attemptCount,
    providerClassification: geo.providerClassification ?? 'unknown',
    noCoordsReason: geo.noCoordsReason,
    queryFingerprint: geo.queryFingerprint,
    lowConfidenceReasons: geo.lowConfidenceReasons,
    geocode_city_raw: raw.length > 0 ? raw : null,
    geocode_city_normalized: norm && norm.length > 0 ? norm : null,
    httpStatus: geo.httpStatus,
  }
}

function mapGeoOutcomeToResultType(geo: GeocodeAddressOutcome): GeocodeAttemptDiagnostic['resultType'] {
  if (geo.coords) return 'success'
  if (geo.hit429) return 'rate_limited'
  const r = geo.noCoordsReason
  if (r === 'low_confidence' && geo.lowConfidenceReasons?.includes('state_mismatch')) return 'cross_state'
  if (r === 'low_confidence') return 'low_confidence'
  if (r === 'empty_results') return 'empty_results'
  if (r === 'http_not_ok') return 'http_error'
  if (r === 'invalid_coordinates') return 'invalid_coordinates'
  if (r === 'fetch_exception') return 'fetch_exception'
  if (r === 'empty_input') return 'empty_input'
  return 'empty_results'
}

function toGeocodeAttemptDiagnostic(
  geo: GeocodeAddressOutcome,
  plan: ReturnType<typeof buildGeocodeAttemptPlan>,
  municipalitySource: string,
  mode: GeocodeMode,
  fallbackArbitrationApplied: boolean,
  diagnosticStrategy?: GeocodeAttemptStrategy
): GeocodeAttemptDiagnostic {
  const rawQs = geo.attemptLog?.queryString
  const queryCharLength =
    typeof rawQs === 'string' && rawQs.length > 0 ? rawQs.length : undefined
  return {
    strategy: diagnosticStrategy ?? mode,
    queryStrategy:
      geo.attemptLog?.queryStrategy ?? (mode === 'primary' ? 'minimal_locality' : 'normalize_locality'),
    addressSource: plan.addressLineSource,
    municipalitySource,
    fallbackArbitrationApplied,
    queryCharLength,
    queryFingerprint: geo.queryFingerprint,
    resultType: mapGeoOutcomeToResultType(geo),
  }
}

/** Schema v2: per-attempt strategy + safe diagnostics (fingerprints / lengths only; no raw query text). */
export function buildIngestedGeocodeFailureDetailsV2(
  attemptCount: number,
  geo: GeocodeAddressOutcome,
  fallbackCityTrimmed: string,
  attempts: GeocodeAttemptDiagnostic[]
): Record<string, unknown> {
  const raw = (geo.geocodeCityRaw ?? fallbackCityTrimmed).trim()
  const norm = geo.geocodeCityNormalized?.trim()
  return {
    schema_version: INGESTED_GEOCODE_FAILURE_DETAILS_SCHEMA_VERSION_V2,
    recorded_at: new Date().toISOString(),
    attemptCount,
    attempts,
    providerClassification: geo.providerClassification ?? 'unknown',
    noCoordsReason: geo.noCoordsReason,
    queryFingerprint: geo.queryFingerprint,
    lowConfidenceReasons: geo.lowConfidenceReasons,
    geocode_city_raw: raw.length > 0 ? raw : null,
    geocode_city_normalized: norm && norm.length > 0 ? norm : null,
    httpStatus: geo.httpStatus,
  }
}

export function mergeFailureDetailsWithGeocodeAttempt(
  existing: unknown,
  geocode: IngestedGeocodeFailureDetailsV1 | Record<string, unknown>
): Record<string, unknown> {
  const prior =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  prior.geocode = geocode
  return prior
}

/** Removes `geocode` diagnostics; returns `null` when nothing else remains (DB-friendly). */
export function removeGeocodeSubDocumentFromFailureDetails(existing: unknown): Record<string, unknown> | null {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return null
  }
  const o = { ...(existing as Record<string, unknown>) }
  delete o.geocode
  return Object.keys(o).length === 0 ? null : o
}

interface ClaimedGeocodeRow {
  id: string
  normalized_address: string | null
  address_raw: string | null
  city: string | null
  state: string | null
  geocode_attempts: number
  failure_reasons: unknown
  /** Hydrated for dead-letter replay counting (optional). */
  failure_details?: unknown
  source_url?: string | null
  raw_payload?: unknown
}

export interface GeocodeWorkerSummary {
  claimed: number
  succeeded: number
  failedRetriable: number
  failedTerminal: number
  rate429Count: number
  providerNoCoordsSummary?: Record<string, number>
  repeatedEmptyResultRetries?: number
  repeatedEmptyResultQueryFingerprints?: Record<string, number>
  processed?: number
  publishTriggered?: number
  publishOk?: number
  publishFailed?: number
  claimedRowIds?: string[]
  /** Tier 0 provider degradation decision for this batch (when evaluated). */
  providerHealth?: ProviderHealthDecision
  /** Bounded signals passed into the classifier for this batch (for operators / next gate). */
  providerHealthSignals?: ProviderHealthSignals
}

export type GeocodeIngestedSaleByIdResult =
  | { outcome: 'skipped'; reason: 'not_found' | 'not_needs_geocode' | 'concurrent_status_change' }
  | { outcome: 'success'; published?: boolean; publishedSaleId?: string }
  | { outcome: 'geocode_failed'; retriable: boolean }
  | { outcome: 'publish_failed'; error: string }

export interface GeocodeWorkerRunOptions {
  batchSizeOverride?: number
  cooldownMinutesOverride?: number
  captureClaimedRowIds?: boolean
  /** Merged into structured telemetry (requestId, correlationId, jobType, etc.) — no PII. */
  telemetryContext?: Record<string, unknown>
  /**
   * Optional Redis queue depth delta (after − before) measured by the caller (e.g. cron).
   * When omitted, provider health skips queue-growth signals (avoids importing the job queue from this module).
   */
  queueDepthDelta?: number | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Caps real sleep so a single cron/worker invocation stays bounded (decision.retryBackoffMs can be higher for telemetry). */
const MAX_APPLIED_PROVIDER_BACKOFF_MS = 2_000

let geocodeProviderHealthRuntime: {
  consecutiveUnhealthyBatches: number
  lastBatchSignals: ProviderHealthSignals | null
} = {
  consecutiveUnhealthyBatches: 0,
  lastBatchSignals: null,
}

/** Test-only reset for provider degradation in-process state. */
export function resetGeocodeProviderHealthRuntimeForTests(): void {
  geocodeProviderHealthRuntime = {
    consecutiveUnhealthyBatches: 0,
    lastBatchSignals: null,
  }
}

function parseBatchSize(): number {
  const raw = process.env.GEOCODE_BATCH_SIZE
  const defaultBatch = 300
  const parsed = raw ? Number.parseInt(raw, 10) : defaultBatch
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultBatch
  }
  return Math.min(parsed, 500)
}

/** Bounded parallelism for processGeocodeAttempt; cap keeps Nominatim load predictable. */
function parseGeocodeConcurrency(): number {
  const raw = process.env.GEOCODE_CONCURRENCY
  const defaultConcurrency = 4
  if (raw === undefined || raw === '') {
    return defaultConcurrency
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultConcurrency
  }
  return Math.min(parsed, 5)
}

/** Preview-only: structured diagnostics without addresses or provider payloads (no PII). */
function isPreviewGeocodeDiagnosticsEnabled(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'preview'
}

function eligibleGeocodeCooldownOrFilter(cooldownMinutes: number): string {
  const cutoffIso = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString()
  return `last_geocode_attempt_at.is.null,last_geocode_attempt_at.lt.${cutoffIso}`
}

type AdminDb = ReturnType<typeof getAdminDb>

async function runPreviewGeocodeClaimDiagnostics(
  admin: AdminDb,
  claimedRows: ClaimedGeocodeRow[],
  batchSize: number,
  cooldownMinutes: number,
  environment: string,
  deploymentEnv: string
): Promise<void> {
  if (!isPreviewGeocodeDiagnosticsEnabled()) {
    return
  }

  const first25 = claimedRows.slice(0, 25)
  const firstClaimedRowIds = first25.map((row) => row.id)
  const firstClaimedRowGeocodeAttempts = first25.map((row) => Number(row.geocode_attempts ?? 0))

  logger.info('Geocode claim RPC resolved (preview diagnostic)', {
    component: 'ingestion/geocodeWorker',
    operation: 'claim_rpc_resolved',
    claimedCount: claimedRows.length,
    firstClaimedRowIds,
    firstClaimedRowGeocodeAttempts,
    batchSize,
    cooldownMinutes,
    environment,
    deploymentEnv,
  })

  if (firstClaimedRowIds.length > 0) {
    try {
      const { data, error } = await fromBase(admin, 'ingested_sales')
        .select('id, created_at, updated_at, geocode_attempts')
        .in('id', firstClaimedRowIds)
      if (error) {
        logger.warn('Preview geocode claim snapshot read failed', {
          component: 'ingestion/geocodeWorker',
          operation: 'claim_rpc_claimed_row_snapshot',
          message: error.message,
          batchSize,
          cooldownMinutes,
        })
      } else {
        const rows = (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
          id: String(row.id ?? ''),
          createdAt: row.created_at != null ? String(row.created_at) : null,
          updatedAt: row.updated_at != null ? String(row.updated_at) : null,
          geocodeAttempts: Number(row.geocode_attempts ?? 0),
        }))
        logger.info('Geocode claim claimed-row snapshot (preview diagnostic)', {
          component: 'ingestion/geocodeWorker',
          operation: 'claim_rpc_claimed_row_snapshot',
          rows,
          batchSize,
          cooldownMinutes,
          environment,
          deploymentEnv,
        })
      }
    } catch (err) {
      logger.warn('Preview geocode claim snapshot threw', {
        component: 'ingestion/geocodeWorker',
        operation: 'claim_rpc_claimed_row_snapshot',
        errorName: err instanceof Error ? err.name : 'UnknownError',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
    }
  }

  try {
    const cooldownOr = eligibleGeocodeCooldownOrFilter(cooldownMinutes)
    const eligibleBase = () =>
      (fromBase(admin, 'ingested_sales') as any)
        .eq('status', 'needs_geocode')
        .lt('geocode_attempts', 3)
        .or(cooldownOr)

    const { count: eligibleCountRaw, error: eligibleCountError } = await eligibleBase().select('*', {
      count: 'exact',
      head: true,
    })
    if (eligibleCountError) {
      logger.warn('Preview eligible population count failed', {
        component: 'ingestion/geocodeWorker',
        operation: 'claim_rpc_eligible_population',
        message: eligibleCountError.message,
        cooldownMinutes,
      })
    }

    const { count: neverAttemptedRaw, error: neverErr } = await eligibleBase()
      .eq('geocode_attempts', 0)
      .select('*', { count: 'exact', head: true })
    if (neverErr) {
      logger.warn('Preview never-attempted eligible count failed', {
        component: 'ingestion/geocodeWorker',
        operation: 'claim_rpc_eligible_population',
        message: neverErr.message,
        cooldownMinutes,
      })
    }

    const { data: oldestCreatedRows, error: ocErr } = await eligibleBase()
      .select('created_at')
      .order('created_at', { ascending: true, nullsFirst: false })
      .limit(1)
    if (ocErr) {
      logger.warn('Preview oldest eligible created_at query failed', {
        component: 'ingestion/geocodeWorker',
        operation: 'claim_rpc_eligible_population',
        message: ocErr.message,
      })
    }

    const { data: oldestUpdatedRows, error: ouErr } = await eligibleBase()
      .select('updated_at')
      .order('updated_at', { ascending: true, nullsFirst: false })
      .limit(1)
    if (ouErr) {
      logger.warn('Preview oldest eligible updated_at query failed', {
        component: 'ingestion/geocodeWorker',
        operation: 'claim_rpc_eligible_population',
        message: ouErr.message,
      })
    }

    const oldestRowC = oldestCreatedRows?.[0] as { created_at?: string | null } | undefined
    const oldestRowU = oldestUpdatedRows?.[0] as { updated_at?: string | null } | undefined
    const oldestEligibleCreatedAt =
      oldestRowC?.created_at != null && oldestRowC.created_at !== '' ? String(oldestRowC.created_at) : null
    const oldestEligibleUpdatedAt =
      oldestRowU?.updated_at != null && oldestRowU.updated_at !== '' ? String(oldestRowU.updated_at) : null

    logger.info('Geocode claim eligible population (preview diagnostic)', {
      component: 'ingestion/geocodeWorker',
      operation: 'claim_rpc_eligible_population',
      eligibleCount: eligibleCountRaw ?? 0,
      neverAttemptedEligibleCount: neverAttemptedRaw ?? 0,
      oldestEligibleCreatedAt,
      oldestEligibleUpdatedAt,
      cooldownMinutes,
      environment,
      deploymentEnv,
    })
  } catch (err) {
    logger.warn('Preview eligible population diagnostic threw', {
      component: 'ingestion/geocodeWorker',
      operation: 'claim_rpc_eligible_population',
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: err instanceof Error ? err.message : String(err),
    })
  }
}

function toFailureReasons(value: unknown): FailureReason[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is FailureReason => typeof item === 'string')
}

function appendFailureReason(reasons: FailureReason[], reason: FailureReason): FailureReason[] {
  if (reasons.includes(reason)) {
    return reasons
  }
  return [...reasons, reason]
}

async function hydrateGeocodeClaimRows(rows: ClaimedGeocodeRow[]): Promise<ClaimedGeocodeRow[]> {
  if (rows.length === 0) return rows

  const admin = getAdminDb()
  const ids = rows.map((r) => r.id)
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, source_url, raw_payload')
    .in('id', ids)

  if (error || !Array.isArray(data)) {
    logger.warn('Geocode worker source_url/raw_payload hydrate failed', {
      component: 'ingestion/geocodeWorker',
      operation: 'hydrate_geocode_claim_rows',
      rowCount: rows.length,
      message: error?.message ?? 'non_array_hydration_result',
    })
    return rows
  }

  const byId = new Map<string, { source_url: string | null; raw_payload: unknown }>()
  for (const row of data as Array<{ id?: string; source_url?: string | null; raw_payload?: unknown }>) {
    if (row?.id) {
      byId.set(row.id, {
        source_url: row.source_url ?? null,
        raw_payload: row.raw_payload ?? null,
      })
    }
  }

  return rows.map((row) => {
    const extra = byId.get(row.id)
    if (!extra) return row
    return {
      ...row,
      source_url: row.source_url ?? extra.source_url,
      raw_payload: row.raw_payload ?? extra.raw_payload,
    }
  })
}

async function hydrateFailureDetailsForClaimRows(admin: AdminDb, rows: ClaimedGeocodeRow[]): Promise<void> {
  if (rows.length === 0) return
  const ids = rows.map((r) => r.id)
  const { data, error } = await fromBase(admin, 'ingested_sales').select('id, failure_details').in('id', ids)
  if (error || !Array.isArray(data)) {
    logger.warn('Geocode worker failure_details hydrate failed', {
      component: 'ingestion/geocodeWorker',
      operation: 'hydrate_failure_details',
      rowCount: rows.length,
      message: error?.message ?? 'non_array_hydration_result',
    })
    return
  }
  const byId = new Map<string, unknown>()
  for (const row of data as Array<{ id?: string; failure_details?: unknown }>) {
    if (row?.id) {
      byId.set(row.id, row.failure_details ?? undefined)
    }
  }
  for (const row of rows) {
    if (byId.has(row.id)) {
      row.failure_details = byId.get(row.id)
    }
  }
}

function shouldRetryGeocodeWithFallback(geo: GeocodeAddressOutcome): boolean {
  if (geo.hit429) return false
  const r = geo.noCoordsReason
  return (
    r === 'empty_results' ||
    r === 'low_confidence' ||
    r === 'invalid_coordinates' ||
    r === 'empty_input'
  )
}

async function persistGeocodeAttemptFailureDetails(
  admin: AdminDb,
  rowId: string,
  attemptCount: number,
  geo: GeocodeAddressOutcome,
  fallbackCityTrimmed: string,
  attemptDiagnostics?: GeocodeAttemptDiagnostic[]
): Promise<void> {
  const details =
    attemptDiagnostics && attemptDiagnostics.length > 0
      ? buildIngestedGeocodeFailureDetailsV2(attemptCount, geo, fallbackCityTrimmed, attemptDiagnostics)
      : (buildIngestedGeocodeFailureDetailsV1(attemptCount, geo, fallbackCityTrimmed) as Record<string, unknown>)
  const { data: prior, error: selErr } = await fromBase(admin, 'ingested_sales')
    .select('failure_details')
    .eq('id', rowId)
    .eq('status', 'needs_geocode')
    .maybeSingle()

  if (selErr) {
    logger.warn('Geocode failure diagnostics read failed', {
      component: 'ingestion/geocodeWorker',
      operation: 'persist_geocode_failure_details_select',
      rowId,
      message: selErr.message,
    })
    return
  }
  if (!prior) {
    return
  }

  const merged = mergeFailureDetailsWithGeocodeAttempt(
    (prior as { failure_details?: unknown }).failure_details,
    details
  )
  const { error: upErr } = await fromBase(admin, 'ingested_sales')
    .update({ failure_details: merged })
    .eq('id', rowId)
    .eq('status', 'needs_geocode')

  if (upErr) {
    logger.warn('Geocode failure diagnostics update failed', {
      component: 'ingestion/geocodeWorker',
      operation: 'persist_geocode_failure_details_update',
      rowId,
      message: upErr.message,
    })
  }
}

async function persistGeocodeDeadLetterMetadata(
  admin: AdminDb,
  rowId: string,
  envelope: GeocodeDeadLetterEnvelope
): Promise<void> {
  const { data: prior, error: selErr } = await fromBase(admin, 'ingested_sales')
    .select('failure_details')
    .eq('id', rowId)
    .eq('status', 'needs_geocode')
    .maybeSingle()

  if (selErr || !prior) {
    logger.warn('Geocode dead-letter: failure_details read skipped', {
      component: 'ingestion/geocodeWorker',
      operation: 'dead_letter_select',
      rowId,
      message: selErr?.message ?? 'no_row',
    })
    return
  }

  const merged = mergeGeocodeDeadLetterIntoFailureDetails(
    (prior as { failure_details?: unknown }).failure_details,
    envelope
  )
  const { error: upErr } = await fromBase(admin, 'ingested_sales')
    .update({ failure_details: merged })
    .eq('id', rowId)
    .eq('status', 'needs_geocode')

  if (upErr) {
    logger.warn('Geocode dead-letter: failure_details update failed', {
      component: 'ingestion/geocodeWorker',
      operation: 'dead_letter_update',
      rowId,
      message: upErr.message,
    })
  }
}

async function recordTerminalDeadLetterClassification(
  admin: AdminDb,
  params: {
    rowId: string
    attemptCount: number
    hit429: boolean
    noCoordsReason?: string | null
    providerClassification?: string | null
    failureDetailsSnapshot: unknown
    telemetryContext?: Record<string, unknown>
  }
): Promise<void> {
  const thresholds = defaultGeocodeDeadLetterThresholds()
  const prior = extractPriorDeadLetterClassificationCount(params.failureDetailsSnapshot)
  const decision = classifyGeocodeTerminalDeadLetter(
    {
      geocodeAttemptsAtTerminal: params.attemptCount,
      hit429: params.hit429,
      noCoordsReason: params.noCoordsReason,
      providerClassification: params.providerClassification,
      priorClassificationCount: prior,
    },
    thresholds
  )
  const envelope = carryOverReplayFieldsOntoDeadLetterEnvelope(
    buildGeocodeDeadLetterEnvelope(decision, prior, Date.now()),
    params.failureDetailsSnapshot
  )
  await persistGeocodeDeadLetterMetadata(admin, params.rowId, envelope)
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.geocode.deadLetterClassified, {
      ...(params.telemetryContext ?? {}),
      disposition: decision.disposition,
      deadLetterReasons: decision.reasons,
      eligibleReplay: decision.eligibleReplay,
      classificationCount: envelope.classification_count,
      replayCooldownMs: envelope.replay_cooldown_ms,
    })
  )
}

async function markGeocodeTerminalNeedsCheck(
  admin: ReturnType<typeof getAdminDb>,
  rowId: string,
  failureReasons: unknown,
  reason: FailureReason
): Promise<boolean> {
  const existingReasons = toFailureReasons(failureReasons)
  const mergedReasons = appendFailureReason(existingReasons, reason)
  const { error: terminalError } = await fromBase(admin, 'ingested_sales')
    .update({
      status: 'needs_check',
      failure_reasons: mergedReasons,
    })
    .eq('id', rowId)
  if (terminalError) {
    logger.error(
      'Failed to mark row as needs_check after geocode retries',
      new Error(terminalError.message),
      {
        component: 'ingestion/geocodeWorker',
        operation: 'mark_needs_check',
        rowId,
      }
    )
    return false
  }
  return true
}

/** One retry: third attempt leaves geocode_attempts at 3 so the claim RPC will never pick the row again if this fails. */
async function markGeocodeTerminalNeedsCheckOnceRetry(
  admin: ReturnType<typeof getAdminDb>,
  rowId: string,
  failureReasons: unknown,
  reason: FailureReason
): Promise<boolean> {
  const first = await markGeocodeTerminalNeedsCheck(admin, rowId, failureReasons, reason)
  if (first) return true
  await new Promise((r) => setTimeout(r, 150))
  return markGeocodeTerminalNeedsCheck(admin, rowId, failureReasons, reason)
}

function mapPublishResultToByIdOutcome(publish: PublishReadyByIdResult): GeocodeIngestedSaleByIdResult {
  if (publish.ok && 'publishedSaleId' in publish) {
    return { outcome: 'success', published: true, publishedSaleId: publish.publishedSaleId }
  }
  if (publish.ok && 'skipped' in publish && publish.skipped) {
    return { outcome: 'success', published: false }
  }
  return { outcome: 'publish_failed', error: 'error' in publish ? publish.error : 'publish failed' }
}

async function applyGeocodeSuccess(
  admin: ReturnType<typeof getAdminDb>,
  rowId: string,
  lat: number,
  lng: number
): Promise<{ kind: 'geocoded'; publish: PublishReadyByIdResult } | { kind: 'update_failed' }> {
  const { data: priorRow, error: priorErr } = await fromBase(admin, 'ingested_sales')
    .select('failure_details')
    .eq('id', rowId)
    .eq('status', 'needs_geocode')
    .maybeSingle()

  const clearedFailureDetails =
    !priorErr && priorRow != null
      ? removeGeocodeSubDocumentFromFailureDetails((priorRow as { failure_details?: unknown }).failure_details)
      : undefined

  const updatePayload: Record<string, unknown> = { lat, lng, status: 'ready' }
  if (clearedFailureDetails !== undefined) {
    updatePayload.failure_details = clearedFailureDetails
  }

  const { data: updated, error: updateError } = await fromBase(admin, 'ingested_sales')
    .update(updatePayload)
    .eq('id', rowId)
    .eq('status', 'needs_geocode')
    .select('id')
    .maybeSingle()

  if (updateError) {
    logger.error('Failed to update geocoded row', new Error(updateError.message), {
      component: 'ingestion/geocodeWorker',
      operation: 'mark_ready',
      rowId,
    })
    return { kind: 'update_failed' }
  }

  const publishResult = await publishReadyIngestedSaleById(rowId)

  if (!updated) {
    logger.info('Geocode update skipped (concurrent transition); publish attempted', {
      component: 'ingestion/geocodeWorker',
      operation: 'apply_geocode_success',
      rowId,
    })
  }

  return { kind: 'geocoded', publish: publishResult }
}

type AttemptResult =
  | { kind: 'geocode_ok'; publish: PublishReadyByIdResult; hit429: false }
  | {
      kind: 'geocode_fail'
      retriable: boolean
      terminal: boolean
      hit429: boolean
      noCoordsReason?: string
      providerClassification?: string
      queryFingerprint?: string
      attemptCount?: number
    }

/**
 * Process items with at most `concurrency` in-flight tasks (pool / work-queue model).
 * Per-item failures are contained by the processor; unexpected throws are caught here.
 */
async function runClaimedRowsWithConcurrency(
  claimedRows: ClaimedGeocodeRow[],
  concurrency: number,
  processRow: (row: ClaimedGeocodeRow) => Promise<AttemptResult>
): Promise<AttemptResult[]> {
  const results: AttemptResult[] = new Array(claimedRows.length)
  if (claimedRows.length === 0) {
    return results
  }

  const limit = Math.max(1, Math.min(concurrency, claimedRows.length))
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      const i = nextIndex++
      if (i >= claimedRows.length) {
        return
      }
      const row = claimedRows[i]
      try {
        results[i] = await processRow(row)
      } catch (error) {
        logger.error(
          'Geocode worker unexpected error processing row',
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'ingestion/geocodeWorker',
            operation: 'row_unexpected_error',
            rowId: row.id,
          }
        )
        results[i] = { kind: 'geocode_fail', retriable: true, terminal: false, hit429: false }
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}

/**
 * Shared processor for a row whose `geocode_attempts` has already been incremented (RPC claim or by-id path).
 */
async function processGeocodeAttempt(
  row: ClaimedGeocodeRow,
  telemetryContext?: Record<string, unknown>
): Promise<AttemptResult> {
  const admin = getAdminDb()
  const rowId = row.id
  const attemptCount = row.geocode_attempts
  const plan = buildGeocodeAttemptPlan(row)
  const attemptDiagnostics: GeocodeAttemptDiagnostic[] = []

  let geo: GeocodeAddressOutcome | null = null

  const runGeocode = async (
    city: string,
    mode: GeocodeMode,
    municipalitySource: string,
    fallbackArbitrationApplied: boolean,
    opts?: { addressLine?: string; diagnosticStrategy?: GeocodeAttemptStrategy }
  ): Promise<GeocodeAddressOutcome> => {
    const address = opts?.addressLine ?? plan.addressLine
    const out = await geocodeAddress({ address, city, state: plan.state }, { mode })
    attemptDiagnostics.push(
      toGeocodeAttemptDiagnostic(
        out,
        plan,
        municipalitySource,
        mode,
        fallbackArbitrationApplied,
        opts?.diagnosticStrategy
      )
    )
    return out
  }

  if (plan.addressLine && plan.primaryCity && plan.state) {
    geo = await runGeocode(plan.primaryCity, 'primary', plan.primaryMunicipalitySource, false)
  }

  if (
    geo &&
    !geo.coords &&
    !geo.hit429 &&
    geo.noCoordsReason === 'empty_results' &&
    plan.addressLine &&
    plan.primaryCity &&
    plan.state
  ) {
    const stripped = stripUnitDesignatorFromAddressLineForGeocode(plan.addressLine)
    if (stripped) {
      geo = await runGeocode(plan.primaryCity, 'primary', plan.primaryMunicipalitySource, false, {
        addressLine: stripped,
        diagnosticStrategy: 'unit_stripped',
      })
    }
  }

  if (
    geo &&
    !geo.coords &&
    !geo.hit429 &&
    shouldRetryGeocodeWithFallback(geo) &&
    !primaryAndFallbackCitiesEquivalent(plan.primaryCity, plan.fallbackCity) &&
    plan.addressLine &&
    plan.fallbackCity &&
    plan.state
  ) {
    geo = await runGeocode(plan.fallbackCity, 'fallback_arbitrated', plan.fallbackMunicipalitySource, true)
  }

  if (!geo && plan.addressLine && plan.fallbackCity && plan.state && !(plan.primaryCity && plan.state)) {
    geo = await runGeocode(plan.fallbackCity, 'fallback_arbitrated', plan.fallbackMunicipalitySource, true)
  }

  if (geo?.coords) {
    const outcome = await applyGeocodeSuccess(admin, rowId, geo.coords.lat, geo.coords.lng)
    if (outcome.kind === 'update_failed') {
      if (isPreviewGeocodeDiagnosticsEnabled()) {
        logger.info('Geocode pipeline attempt outcome (preview diagnostic)', {
          component: 'ingestion/geocodeWorker',
          operation: 'process_geocode_attempt',
          rowId,
          attemptCount,
          path: 'apply_ready_update_failed',
        })
      }
      logger.warn('Geocode worker row processed', {
        component: 'ingestion/geocodeWorker',
        operation: 'row_result',
        rowId,
        attemptCount,
        result: 'update_failed_after_geocode',
        queryFingerprint: geo.queryFingerprint,
      })
      return {
        kind: 'geocode_fail',
        retriable: true,
        terminal: false,
        hit429: false,
        providerClassification: geo.providerClassification,
        queryFingerprint: geo.queryFingerprint,
        attemptCount,
      }
    }

    logger.info('Geocode worker row processed', {
      component: 'ingestion/geocodeWorker',
      operation: 'row_result',
      rowId,
      attemptCount,
      result: 'geocode_ok',
    })

    return { kind: 'geocode_ok', publish: outcome.publish, hit429: false }
  }

  if (geo) {
    const hit429 = geo.hit429
    const fallbackCityForDetails = plan.fallbackCity || row.city?.trim() || ''
    if (isPreviewGeocodeDiagnosticsEnabled()) {
      logger.info('Geocode pipeline attempt outcome (preview diagnostic)', {
        component: 'ingestion/geocodeWorker',
        operation: 'process_geocode_attempt',
        rowId,
        attemptCount,
        path: 'provider_no_coords',
        noCoordsReason: geo.noCoordsReason ?? 'unknown',
        providerClassification: geo.providerClassification ?? 'unknown',
        queryFingerprint: geo.queryFingerprint ?? null,
        hit429,
        httpStatus: geo.httpStatus,
        geocodeAttemptsLogged: attemptDiagnostics.length,
      })
    }
    await persistGeocodeAttemptFailureDetails(
      admin,
      rowId,
      attemptCount,
      geo,
      fallbackCityForDetails,
      attemptDiagnostics
    )
    if (attemptCount >= 3) {
      await recordTerminalDeadLetterClassification(admin, {
        rowId,
        attemptCount,
        hit429,
        noCoordsReason: geo.noCoordsReason,
        providerClassification: geo.providerClassification,
        failureDetailsSnapshot: row.failure_details,
        telemetryContext,
      })
      const ok = await markGeocodeTerminalNeedsCheckOnceRetry(admin, rowId, row.failure_reasons, 'geocode_failed')
      if (ok) {
        logger.warn('Geocode worker row processed', {
          component: 'ingestion/geocodeWorker',
          operation: 'row_result',
          rowId,
          attemptCount,
          result: 'failed_terminal',
          noCoordsReason: geo.noCoordsReason ?? 'unknown',
          providerClassification: geo.providerClassification ?? 'unknown',
          queryFingerprint: geo.queryFingerprint ?? null,
        })
        return {
          kind: 'geocode_fail',
          retriable: false,
          terminal: true,
          hit429,
          noCoordsReason: geo.noCoordsReason,
          providerClassification: geo.providerClassification,
          queryFingerprint: geo.queryFingerprint,
          attemptCount,
        }
      }
      return {
        kind: 'geocode_fail',
        retriable: true,
        terminal: false,
        hit429,
        noCoordsReason: geo.noCoordsReason,
        providerClassification: geo.providerClassification,
        queryFingerprint: geo.queryFingerprint,
        attemptCount,
      }
    }

    logger.warn('Geocode worker row processed', {
      component: 'ingestion/geocodeWorker',
      operation: 'row_result',
      rowId,
      attemptCount,
      result: 'failed_retriable',
      noCoordsReason: geo.noCoordsReason ?? 'unknown',
      providerClassification: geo.providerClassification ?? 'unknown',
      queryFingerprint: geo.queryFingerprint ?? null,
    })
    if (geo.noCoordsReason === 'empty_results' && attemptCount > 1) {
      logger.warn('Geocode worker repeated empty-result retry', {
        component: 'ingestion/geocodeWorker',
        operation: 'repeated_empty_results_retry',
        rowId,
        attemptCount,
        queryFingerprint: geo.queryFingerprint ?? null,
        providerClassification: geo.providerClassification ?? 'empty_results',
      })
    }
    return {
      kind: 'geocode_fail',
      retriable: true,
      terminal: false,
      hit429,
      noCoordsReason: geo.noCoordsReason,
      providerClassification: geo.providerClassification,
      queryFingerprint: geo.queryFingerprint,
      attemptCount,
    }
  }

  const cityNormalizedMissing =
    (plan.fallbackCity || row.city?.trim() || '').length > 0
      ? (normalizeLocalityForGeocodeQuery(plan.fallbackCity || row.city?.trim() || '') ??
        (plan.fallbackCity || row.city?.trim() || undefined))
      : undefined
  const syntheticMissingLocalityGeo: GeocodeAddressOutcome = {
    coords: null,
    hit429: false,
    noCoordsReason: 'empty_input',
    providerClassification: 'empty_results',
    geocodeCityRaw: plan.fallbackCity || row.city?.trim() || undefined,
    geocodeCityNormalized: cityNormalizedMissing,
  }
  await persistGeocodeAttemptFailureDetails(
    admin,
    rowId,
    attemptCount,
    syntheticMissingLocalityGeo,
    plan.fallbackCity || row.city?.trim() || ''
  )

  if (attemptCount >= 3) {
    await recordTerminalDeadLetterClassification(admin, {
      rowId,
      attemptCount,
      hit429: false,
      noCoordsReason: syntheticMissingLocalityGeo.noCoordsReason,
      providerClassification: syntheticMissingLocalityGeo.providerClassification,
      failureDetailsSnapshot: row.failure_details,
      telemetryContext,
    })
    const ok = await markGeocodeTerminalNeedsCheckOnceRetry(admin, rowId, row.failure_reasons, 'geocode_failed')
    if (ok) {
      logger.warn('Geocode worker row processed', {
        component: 'ingestion/geocodeWorker',
        operation: 'row_result',
        rowId,
        attemptCount,
        result: 'failed_terminal',
      })
      return { kind: 'geocode_fail', retriable: false, terminal: true, hit429: false }
    }
    return { kind: 'geocode_fail', retriable: true, terminal: false, hit429: false }
  }

  if (isPreviewGeocodeDiagnosticsEnabled()) {
    logger.info('Geocode pipeline attempt outcome (preview diagnostic)', {
      component: 'ingestion/geocodeWorker',
      operation: 'process_geocode_attempt',
      rowId,
      attemptCount,
      path: 'missing_address_components',
    })
  }

  logger.warn('Geocode worker row processed', {
    component: 'ingestion/geocodeWorker',
    operation: 'row_result',
    rowId,
    attemptCount,
    result: 'failed_retriable',
  })
  return { kind: 'geocode_fail', retriable: true, terminal: false, hit429: false }
}

/**
 * Idempotent single-row geocode + lifecycle transition + publish trigger (spec §6, §11).
 * Safe to call multiple times; no-ops when status is no longer `needs_geocode`.
 */
export async function geocodeIngestedSaleById(saleId: string): Promise<GeocodeIngestedSaleByIdResult> {
  const admin = getAdminDb()

  const { data: row, error: fetchError } = await fromBase(admin, 'ingested_sales')
    .select(
      'id, status, normalized_address, address_raw, city, state, lat, lng, geocode_attempts, failure_reasons, failure_details, published_sale_id, source_url, raw_payload'
    )
    .eq('id', saleId)
    .maybeSingle()

  if (fetchError || !row) {
    if (fetchError) {
      logger.error('geocodeIngestedSaleById fetch failed', new Error(fetchError.message), {
        component: 'ingestion/geocodeWorker',
        operation: 'fetch_row',
        saleId,
      })
    }
    return { outcome: 'skipped', reason: 'not_found' }
  }

  const r = row as {
    id: string
    status: string
    normalized_address: string | null
    address_raw: string | null
    city: string | null
    state: string | null
    lat: unknown
    lng: unknown
    geocode_attempts: number
    failure_reasons: unknown
    failure_details?: unknown
    published_sale_id: string | null
    source_url?: string | null
    raw_payload?: unknown
  }

  if (r.status !== 'needs_geocode') {
    return { outcome: 'skipped', reason: 'not_needs_geocode' }
  }

  const latN = r.lat != null ? Number(r.lat) : NaN
  const lngN = r.lng != null ? Number(r.lng) : NaN
  if (Number.isFinite(latN) && Number.isFinite(lngN)) {
    const { error: readyError } = await fromBase(admin, 'ingested_sales')
      .update({ status: 'ready' })
      .eq('id', r.id)
      .eq('status', 'needs_geocode')

    if (readyError) {
      logger.error('geocodeIngestedSaleById failed to mark ready (pre-existing coords)', new Error(readyError.message), {
        component: 'ingestion/geocodeWorker',
        operation: 'mark_ready_stuck_coords',
        saleId: r.id,
      })
      return { outcome: 'geocode_failed', retriable: true }
    }

    return mapPublishResultToByIdOutcome(await publishReadyIngestedSaleById(r.id))
  }

  const nextAttempts = (r.geocode_attempts ?? 0) + 1
  const { data: bumped, error: bumpError } = await fromBase(admin, 'ingested_sales')
    .update({
      geocode_attempts: nextAttempts,
      last_geocode_attempt_at: new Date().toISOString(),
    })
    .eq('id', saleId)
    .eq('status', 'needs_geocode')
    .select('id')
    .maybeSingle()

  if (bumpError) {
    logger.error('geocodeIngestedSaleById attempt bump failed', new Error(bumpError.message), {
      component: 'ingestion/geocodeWorker',
      operation: 'bump_attempts',
      saleId,
    })
    return { outcome: 'geocode_failed', retriable: true }
  }

  if (!bumped) {
    return { outcome: 'skipped', reason: 'concurrent_status_change' }
  }

  const attemptRow: ClaimedGeocodeRow = {
    id: r.id,
    normalized_address: r.normalized_address,
    address_raw: r.address_raw ?? null,
    city: r.city,
    state: r.state,
    geocode_attempts: nextAttempts,
    failure_reasons: r.failure_reasons,
    failure_details: r.failure_details,
    source_url: r.source_url ?? null,
    raw_payload: r.raw_payload ?? null,
  }

  const attempt = await processGeocodeAttempt(attemptRow)
  if (attempt.kind === 'geocode_ok') {
    return mapPublishResultToByIdOutcome(attempt.publish)
  }
  return { outcome: 'geocode_failed', retriable: attempt.retriable }
}

export async function geocodePendingSales(options?: GeocodeWorkerRunOptions): Promise<GeocodeWorkerSummary> {
  const admin = getAdminDb()
  const defaultBatchSize = parseBatchSize()
  const batchSizeCandidate = options?.batchSizeOverride
  const batchSize =
    typeof batchSizeCandidate === 'number' && Number.isFinite(batchSizeCandidate) && batchSizeCandidate > 0
      ? Math.min(Math.floor(batchSizeCandidate), 500)
      : defaultBatchSize
  const cooldownCandidate = options?.cooldownMinutesOverride
  const cooldownMinutes =
    typeof cooldownCandidate === 'number' && Number.isFinite(cooldownCandidate) && cooldownCandidate >= 0
      ? Math.min(Math.floor(cooldownCandidate), 60)
      : 2
  const batchStarted = Date.now()
  const environment = process.env.NODE_ENV || 'development'
  const deploymentEnv = process.env.VERCEL_ENV || 'unknown'
  const providerThresholds = defaultProviderHealthThresholds()

  const ZERO_SIGNALS: ProviderHealthSignals = {
    recent429Ratio: 0,
    timeoutRatio: 0,
    consecutiveFailures: 0,
    retryExhaustionRate: 0,
  }

  const qd = options?.queueDepthDelta
  const queueGrowthFromCaller =
    typeof qd === 'number' && Number.isFinite(qd) ? qd : undefined

  const gateBase = geocodeProviderHealthRuntime.lastBatchSignals ?? ZERO_SIGNALS
  const gateSignals: ProviderHealthSignals = {
    ...gateBase,
    consecutiveFailures: geocodeProviderHealthRuntime.consecutiveUnhealthyBatches,
  }
  const gateDecision = classifyProviderHealth(gateSignals, providerThresholds)

  if (gateDecision.shouldPauseNewClaims) {
    logger.warn('Geocode worker skipping claims (provider degradation gate)', {
      component: 'ingestion/geocodeWorker',
      operation: 'provider_gate_pause',
      environment,
      deploymentEnv,
      batchSize,
      providerHealthStatus: gateDecision.status,
      providerHealthReasons: gateDecision.reasons,
    })
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.geocode.batchStarted, {
        ...(options?.telemetryContext ?? {}),
        batchSize,
        cooldownMinutes,
        environment,
        deploymentEnv,
        jobType: 'geocode.db_claim_batch',
        claimsPaused: true,
        providerHealthStatus: gateDecision.status,
      })
    )
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.geocode.providerHealthClassified, {
        ...(options?.telemetryContext ?? {}),
        phase: 'gate',
        providerHealthStatus: gateDecision.status,
        providerHealthReasons: gateDecision.reasons,
        retryBackoffMs: gateDecision.retryBackoffMs,
        shouldReduceConcurrency: gateDecision.shouldReduceConcurrency,
        shouldPauseNewClaims: gateDecision.shouldPauseNewClaims,
        queueDepthDeltaSupplied: queueGrowthFromCaller !== undefined,
      })
    )
    const pauseBackoff = Math.min(gateDecision.retryBackoffMs, MAX_APPLIED_PROVIDER_BACKOFF_MS)
    if (pauseBackoff > 0) {
      await sleep(pauseBackoff)
    }
    return {
      claimed: 0,
      succeeded: 0,
      failedRetriable: 0,
      failedTerminal: 0,
      rate429Count: 0,
      providerNoCoordsSummary: {},
      repeatedEmptyResultRetries: 0,
      repeatedEmptyResultQueryFingerprints: {},
      processed: 0,
      publishTriggered: 0,
      publishOk: 0,
      publishFailed: 0,
      providerHealth: gateDecision,
      providerHealthSignals: gateSignals,
    }
  }

  logger.info('Geocode worker batch started', {
    component: 'ingestion/geocodeWorker',
    operation: 'batch_start',
    batchSize,
    cooldownMinutes,
    environment,
    deploymentEnv,
    providerHealthStatus: gateDecision.status,
  })

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.geocode.batchStarted, {
      ...(options?.telemetryContext ?? {}),
      batchSize,
      cooldownMinutes,
      environment,
      deploymentEnv,
      jobType: 'geocode.db_claim_batch',
      providerHealthStatus: gateDecision.status,
      claimsPaused: false,
    })
  )

  const { data, error } = await (admin as any).rpc('claim_ingested_sales_for_geocoding', {
    p_batch_size: batchSize,
    p_cooldown_minutes: cooldownMinutes,
  })

  if (error) {
    logger.error('Failed to claim rows for geocoding worker', new Error(error.message), {
      component: 'ingestion/geocodeWorker',
      operation: 'claim_rows',
      batchSize,
    })
    throw error
  }

  const claimedRows = await hydrateGeocodeClaimRows((Array.isArray(data) ? data : []) as ClaimedGeocodeRow[])
  await hydrateFailureDetailsForClaimRows(admin, claimedRows)
  const concurrency = parseGeocodeConcurrency()
  const effectiveConcurrency = gateDecision.shouldReduceConcurrency
    ? Math.max(1, Math.floor(concurrency / 2))
    : concurrency
  const summary: GeocodeWorkerSummary = {
    claimed: claimedRows.length,
    succeeded: 0,
    failedRetriable: 0,
    failedTerminal: 0,
    rate429Count: 0,
    providerNoCoordsSummary: {},
    repeatedEmptyResultRetries: 0,
    repeatedEmptyResultQueryFingerprints: {},
    ...(options?.captureClaimedRowIds
      ? { claimedRowIds: claimedRows.map((row) => row.id).slice(0, 5) }
      : {}),
  }

  await runPreviewGeocodeClaimDiagnostics(
    admin,
    claimedRows,
    batchSize,
    cooldownMinutes,
    environment,
    deploymentEnv
  )

  if (summary.claimed === 0) {
    logger.warn('Geocode worker claimed zero rows', {
      component: 'ingestion/geocodeWorker',
      operation: 'claim_rows_empty',
      batchSize,
      cooldownMinutes,
      environment,
      deploymentEnv,
      durationMs: Date.now() - batchStarted,
    })
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.geocode.claimEmpty, {
        ...(options?.telemetryContext ?? {}),
        batchSize,
        cooldownMinutes,
        environment,
        deploymentEnv,
        durationMs: Date.now() - batchStarted,
        dbBacklogDepletionSignal: true,
        queuePressureClass: classifyQueuePressure(0, Math.max(1, batchSize)),
      })
    )
  }

  const rowResults = await runClaimedRowsWithConcurrency(
    claimedRows,
    effectiveConcurrency,
    (row) => processGeocodeAttempt(row, options?.telemetryContext)
  )

  for (const rowResult of rowResults) {
    if (rowResult.kind === 'geocode_fail' && rowResult.hit429) {
      summary.rate429Count += 1
    }
    if (rowResult.kind === 'geocode_fail') {
      const reason = rowResult.noCoordsReason || rowResult.providerClassification || 'unknown'
      summary.providerNoCoordsSummary![reason] = (summary.providerNoCoordsSummary![reason] || 0) + 1
      const repeatedEmpty =
        rowResult.attemptCount != null && rowResult.attemptCount > 1 && rowResult.noCoordsReason === 'empty_results'
      if (repeatedEmpty) {
        summary.repeatedEmptyResultRetries = (summary.repeatedEmptyResultRetries || 0) + 1
        const fp = rowResult.queryFingerprint?.trim()
        if (fp) {
          summary.repeatedEmptyResultQueryFingerprints![fp] =
            (summary.repeatedEmptyResultQueryFingerprints![fp] || 0) + 1
        }
      }
    }
    if (rowResult.kind === 'geocode_ok') {
      summary.succeeded += 1
    } else if (rowResult.terminal) {
      summary.failedTerminal += 1
    } else {
      summary.failedRetriable += 1
    }
  }

  const durationMs = Date.now() - batchStarted
  const failureCount = summary.failedRetriable + summary.failedTerminal
  const processedCount = summary.succeeded + failureCount
  let publishTriggeredCount = 0
  let publishOkCount = 0
  let publishFailedCount = 0

  for (const rowResult of rowResults) {
    if (rowResult.kind !== 'geocode_ok') continue
    publishTriggeredCount += 1
    const publish = rowResult.publish
    if (publish.ok) {
      publishOkCount += 1
    } else {
      publishFailedCount += 1
    }
  }

  let fetchExceptionFails = 0
  for (const rowResult of rowResults) {
    if (rowResult.kind === 'geocode_fail' && rowResult.noCoordsReason === 'fetch_exception') {
      fetchExceptionFails += 1
    }
  }

  const queueGrowth = queueGrowthFromCaller

  let maxPoisonFp = 0
  if (summary.repeatedEmptyResultQueryFingerprints) {
    for (const v of Object.values(summary.repeatedEmptyResultQueryFingerprints)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        maxPoisonFp = Math.max(maxPoisonFp, v)
      }
    }
  }

  const consecutiveAtStart = geocodeProviderHealthRuntime.consecutiveUnhealthyBatches
  const denom = Math.max(1, processedCount)
  const batchSignals: ProviderHealthSignals = {
    recent429Ratio: summary.rate429Count / denom,
    timeoutRatio: fetchExceptionFails / denom,
    consecutiveFailures: consecutiveAtStart,
    staleQueueGrowth: queueGrowth,
    retryExhaustionRate: summary.failedTerminal / denom,
    maxRepeatedEmptyFingerprintCount: maxPoisonFp > 0 ? maxPoisonFp : undefined,
  }
  const batchDecision = classifyProviderHealth(batchSignals, providerThresholds)
  summary.providerHealth = batchDecision
  summary.providerHealthSignals = batchSignals

  if (batchDecision.status === 'healthy') {
    geocodeProviderHealthRuntime.consecutiveUnhealthyBatches = 0
  } else {
    geocodeProviderHealthRuntime.consecutiveUnhealthyBatches = consecutiveAtStart + 1
  }
  geocodeProviderHealthRuntime.lastBatchSignals = {
    ...batchSignals,
    consecutiveFailures: geocodeProviderHealthRuntime.consecutiveUnhealthyBatches,
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.geocode.providerHealthClassified, {
      ...(options?.telemetryContext ?? {}),
      phase: 'batch',
      providerHealthStatus: batchDecision.status,
      providerHealthReasons: batchDecision.reasons,
      retryBackoffMs: batchDecision.retryBackoffMs,
      shouldReduceConcurrency: batchDecision.shouldReduceConcurrency,
      shouldPauseNewClaims: batchDecision.shouldPauseNewClaims,
      queueGrowth,
      queueDepthDeltaSupplied: queueGrowthFromCaller !== undefined,
      effectiveConcurrency,
      configuredConcurrency: concurrency,
      maxPoisonFingerprintCount: maxPoisonFp,
    })
  )

  if (failureCount > 0) {
    logger.warn('Geocode worker encountered geocode/provider failures', {
      component: 'ingestion/geocodeWorker',
      operation: 'batch_failures',
      claimed: summary.claimed,
      processed: processedCount,
      failedRetriable: summary.failedRetriable,
      failedTerminal: summary.failedTerminal,
      rate429Count: summary.rate429Count,
      providerNoCoordsSummary: summary.providerNoCoordsSummary,
      repeatedEmptyResultRetries: summary.repeatedEmptyResultRetries,
      repeatedEmptyResultQueryFingerprints: summary.repeatedEmptyResultQueryFingerprints,
      durationMs,
      providerHealthStatus: batchDecision.status,
    })
  }

  logger.info('Geocode worker completed batch', {
    component: 'ingestion/geocodeWorker',
    operation: 'batch_complete',
    environment,
    deploymentEnv,
    batchSize,
    claimed: summary.claimed,
    processed: processedCount,
    succeeded: summary.succeeded,
    failedRetriable: summary.failedRetriable,
    failedTerminal: summary.failedTerminal,
    rate429Count: summary.rate429Count,
    providerNoCoordsSummary: summary.providerNoCoordsSummary,
    repeatedEmptyResultRetries: summary.repeatedEmptyResultRetries,
    repeatedEmptyResultQueryFingerprints: summary.repeatedEmptyResultQueryFingerprints,
    publishTriggered: publishTriggeredCount,
    publishOk: publishOkCount,
    publishFailed: publishFailedCount,
    failureCount,
    durationMs,
    concurrency: effectiveConcurrency,
    configuredConcurrency: concurrency,
    providerHealthStatus: batchDecision.status,
  })

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.geocode.batchCompleted, {
      ...(options?.telemetryContext ?? {}),
      environment,
      deploymentEnv,
      batchSize,
      claimed: summary.claimed,
      processed: processedCount,
      succeeded: summary.succeeded,
      failedRetriable: summary.failedRetriable,
      failedTerminal: summary.failedTerminal,
      skippedRows: 0,
      rowsProcessed: processedCount,
      rate429Count: summary.rate429Count,
      repeatedEmptyResultRetries: summary.repeatedEmptyResultRetries ?? 0,
      publishTriggered: publishTriggeredCount,
      publishOk: publishOkCount,
      publishFailed: publishFailedCount,
      durationMs,
      concurrency: effectiveConcurrency,
      configuredConcurrency: concurrency,
      queuePressureClass: classifyQueuePressure(summary.claimed, Math.max(1, batchSize)),
      dbBacklogDepletionSignal: summary.claimed === 0,
      providerHealthStatus: batchDecision.status,
      providerHealthReasons: batchDecision.reasons,
      queueGrowth,
      maxPoisonFingerprintCount: maxPoisonFp,
    })
  )

  summary.processed = processedCount
  summary.publishTriggered = publishTriggeredCount
  summary.publishOk = publishOkCount
  summary.publishFailed = publishFailedCount

  const tailBackoff = Math.min(batchDecision.retryBackoffMs, MAX_APPLIED_PROVIDER_BACKOFF_MS)
  if (tailBackoff > 0) {
    await sleep(tailBackoff)
  }

  return summary
}
