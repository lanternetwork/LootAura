/**
 * Bounded admin/cron replay: move transient-terminal `retryable` dead-letter rows from `needs_check`
 * back to `needs_geocode` with cooldown + max replay enforcement (no PII in telemetry fields).
 */

import { emitObservabilityRecord, buildTelemetryRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import { stripGeocodeFailedFromFailureReasons } from '@/lib/ingestion/uploadGeocodeRetryReset'
import { publishLinkageFieldsToClearOnReopenUpload } from '@/lib/ingestion/uploadPublishLinkageCleanup'
import type { FailureReason } from '@/lib/ingestion/types'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import {
  DEFAULT_MAX_GEOCODE_DEAD_LETTER_REPLAYS,
  GEOCODE_DEAD_LETTER_SCHEMA_VERSION,
  mergeGeocodeDeadLetterIntoFailureDetails,
  type DeadLetterDisposition,
  type GeocodeDeadLetterEnvelope,
  type GeocodeDeadLetterReason,
} from '@/lib/geocode/deadLetter'

export type GeocodeDeadLetterReplaySkipReason =
  | 'wrong_status'
  | 'no_dead_letter'
  | 'not_retryable_disposition'
  | 'ineligible_replay_flag'
  | 'permanent_terminal'
  | 'cooldown_active'
  | 'replay_exhausted'

export type GeocodeDeadLetterReplayRunResult = {
  attempted: number
  eligible: number
  replayed: number
  skipped: number
}

function toFailureReasonArray(value: unknown): FailureReason[] {
  if (!Array.isArray(value)) return []
  return value.filter((x): x is FailureReason => typeof x === 'string')
}

function readDeadLetterSection(failureDetails: unknown): Record<string, unknown> | null {
  if (!failureDetails || typeof failureDetails !== 'object' || Array.isArray(failureDetails)) return null
  const dl = (failureDetails as Record<string, unknown>).geocode_dead_letter
  if (!dl || typeof dl !== 'object' || Array.isArray(dl)) return null
  return dl as Record<string, unknown>
}

function readFiniteNumber(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return v
}

function readReasons(dl: Record<string, unknown>): GeocodeDeadLetterReason[] {
  const r = dl.reasons
  if (!Array.isArray(r)) return []
  const allowed = new Set<string>([
    'transient_provider',
    'ambiguous_or_low_confidence',
    'empty_or_unresolved_results',
    'missing_address_input',
    'replay_budget_exhausted',
    'invalid_metrics',
  ])
  return r.filter((x): x is GeocodeDeadLetterReason => typeof x === 'string' && allowed.has(x))
}

/** Pure predicate for tests and replay runner (fail-closed). */
export function evaluateGeocodeDeadLetterReplayEligibility(params: {
  status: string
  failureDetails: unknown
  nowMs: number
  maxReplayAttempts: number
}): { ok: true } | { ok: false; reason: GeocodeDeadLetterReplaySkipReason } {
  if (params.status !== 'needs_check') {
    return { ok: false, reason: 'wrong_status' }
  }
  const dl = readDeadLetterSection(params.failureDetails)
  if (!dl) {
    return { ok: false, reason: 'no_dead_letter' }
  }
  const disposition = dl.disposition
  if (disposition === 'permanent_terminal') {
    return { ok: false, reason: 'permanent_terminal' }
  }
  if (disposition !== 'retryable') {
    return { ok: false, reason: 'not_retryable_disposition' }
  }
  if (dl.eligible_replay !== true) {
    return { ok: false, reason: 'ineligible_replay_flag' }
  }
  const schemaVersion = Math.floor(readFiniteNumber(dl.schema_version, 0))
  if (schemaVersion !== GEOCODE_DEAD_LETTER_SCHEMA_VERSION) {
    return { ok: false, reason: 'no_dead_letter' }
  }
  const classifiedAt = readFiniteNumber(dl.classified_at_ms, NaN)
  const cooldownMs = readFiniteNumber(dl.replay_cooldown_ms, NaN)
  if (!Number.isFinite(classifiedAt) || !Number.isFinite(cooldownMs)) {
    return { ok: false, reason: 'no_dead_letter' }
  }
  if (params.nowMs < classifiedAt + cooldownMs) {
    return { ok: false, reason: 'cooldown_active' }
  }
  const replayCount = Math.max(0, Math.floor(readFiniteNumber(dl.replay_count, 0)))
  if (replayCount >= params.maxReplayAttempts) {
    return { ok: false, reason: 'replay_exhausted' }
  }
  return { ok: true }
}

function envelopeFromDeadLetterJson(
  dl: Record<string, unknown>,
  nowMs: number,
  nextReplayCount: number
): GeocodeDeadLetterEnvelope | null {
  const disposition = dl.disposition as DeadLetterDisposition | undefined
  if (disposition !== 'retryable') return null
  const classification_count = Math.max(
    0,
    Math.floor(readFiniteNumber(dl.classification_count, 0))
  )
  const classified_at_ms = Math.floor(readFiniteNumber(dl.classified_at_ms, 0))
  const replay_cooldown_ms = Math.max(0, Math.floor(readFiniteNumber(dl.replay_cooldown_ms, 0)))
  const eligible_replay = dl.eligible_replay === true
  const reasons = readReasons(dl)
  if (!eligible_replay || reasons.length === 0) return null
  return {
    schema_version: GEOCODE_DEAD_LETTER_SCHEMA_VERSION,
    disposition,
    classification_count,
    classified_at_ms,
    replay_cooldown_ms,
    eligible_replay,
    reasons,
    replay_count: nextReplayCount,
    last_replay_at_ms: nowMs,
  }
}

export type GeocodeDeadLetterReplayRow = {
  id: string
  status: string
  failure_details: unknown
  failure_reasons: unknown
}

export async function runBoundedGeocodeDeadLetterReplay(params: {
  limit: number
  nowMs?: number
  maxReplayAttempts?: number
  telemetryContext?: Record<string, unknown>
}): Promise<GeocodeDeadLetterReplayRunResult> {
  const admin = getAdminDb()
  const nowMs = params.nowMs ?? Date.now()
  const maxReplayAttempts = params.maxReplayAttempts ?? DEFAULT_MAX_GEOCODE_DEAD_LETTER_REPLAYS
  const limit = Math.max(1, Math.min(Math.floor(params.limit), 200))
  const scanCap = Math.min(500, Math.max(limit * 20, limit))

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, status, failure_details, failure_reasons')
    .eq('status', 'needs_check')
    .not('failure_details', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(scanCap)

  if (error) {
    throw new Error(error.message)
  }

  const rows = (Array.isArray(data) ? data : []) as GeocodeDeadLetterReplayRow[]
  let eligible = 0
  let exhaustedSkips = 0
  let ineligible = 0
  const toReplay: GeocodeDeadLetterReplayRow[] = []

  for (const row of rows) {
    const ev = evaluateGeocodeDeadLetterReplayEligibility({
      status: row.status,
      failureDetails: row.failure_details,
      nowMs,
      maxReplayAttempts,
    })
    if (!ev.ok) {
      ineligible += 1
      if (ev.reason === 'replay_exhausted') exhaustedSkips += 1
      continue
    }
    eligible += 1
    if (toReplay.length < limit) {
      toReplay.push(row)
    }
  }

  let replayed = 0
  for (const row of toReplay) {
    const dl = readDeadLetterSection(row.failure_details)
    if (!dl) continue
    const currentReplay = Math.max(0, Math.floor(readFiniteNumber(dl.replay_count, 0)))
    const nextReplay = currentReplay + 1
    const envelope = envelopeFromDeadLetterJson(dl, nowMs, nextReplay)
    if (!envelope) continue

    const mergedDetails = mergeGeocodeDeadLetterIntoFailureDetails(row.failure_details, envelope)
    const reasons = stripGeocodeFailedFromFailureReasons(toFailureReasonArray(row.failure_reasons))
    const publishClear = publishLinkageFieldsToClearOnReopenUpload('needs_geocode')

    const updatePayload: Record<string, unknown> = {
      status: 'needs_geocode',
      geocode_attempts: 0,
      last_geocode_attempt_at: null,
      failure_details: mergedDetails,
      failure_reasons: reasons,
      ...(publishClear ?? {}),
    }

    const { data: updated, error: upErr } = await fromBase(admin, 'ingested_sales')
      .update(updatePayload)
      .eq('id', row.id)
      .eq('status', 'needs_check')
      .select('id')
      .maybeSingle()

    if (upErr) {
      continue
    }
    if (!updated) {
      continue
    }
    replayed += 1
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.geocode.deadLetterReplayed, {
        ...(params.telemetryContext ?? {}),
        replayCount: nextReplay,
        maxReplayAttempts,
      })
    )
  }

  const attempted = toReplay.length
  const queuedPastLimit = Math.max(0, eligible - attempted)
  const skipped = ineligible + queuedPastLimit + (attempted - replayed)

  if (exhaustedSkips > 0) {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.geocode.replayExhausted, {
        ...(params.telemetryContext ?? {}),
        exhaustedSkips,
        maxReplayAttempts,
      })
    )
  }

  return {
    attempted,
    eligible,
    replayed,
    skipped,
  }
}
