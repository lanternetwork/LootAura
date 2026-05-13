/**
 * Sentry emission for ingestion health transitions (Tier 0).
 *
 * Policy:
 * - Allowed transitions only (see `ALLOWED_TRANSITIONS`); healthy→critical is bridged as degraded→critical.
 * - Identical fingerprint (`status` + sorted `reasons`) is never re-emitted until it changes (no per-batch / per-row spam).
 * - `emittedAtMs` is stored for future TTL extensions; default behavior is indefinite dedup on unchanged fingerprint.
 */

import * as Sentry from '@sentry/nextjs'
import type { IngestionHealthEvaluation, IngestionHealthStatus } from './ingestionHealth'

const ALLOWED_TRANSITIONS: ReadonlyArray<readonly [IngestionHealthStatus, IngestionHealthStatus]> = [
  ['healthy', 'degraded'],
  ['degraded', 'critical'],
  ['critical', 'healthy'],
  ['degraded', 'healthy'],
]

/** Fingerprint material: status + canonical reason set (sorted). */
export function fingerprintIngestionHealth(evaluation: IngestionHealthEvaluation): string {
  const r = [...evaluation.reasons].sort().join('|')
  return `${evaluation.status}:${r}`
}

type LastEmitted = {
  status: IngestionHealthStatus
  fingerprint: string
  emittedAtMs: number
}

let lastEmitted: LastEmitted | null = null

/**
 * Clears in-process emission memory (tests only).
 */
export function resetIngestionHealthReporterForTests(): void {
  lastEmitted = null
}

function isTransitionAllowed(from: IngestionHealthStatus, to: IngestionHealthStatus): boolean {
  if (from === to) return false
  return ALLOWED_TRANSITIONS.some(([a, b]) => a === from && b === to)
}

function sentryFingerprintArray(evaluation: IngestionHealthEvaluation): string[] {
  return ['ingestion-health', evaluation.status, ...[...evaluation.reasons].sort()]
}

function emitSentry(from: IngestionHealthStatus, to: IngestionHealthStatus, evaluation: IngestionHealthEvaluation): void {
  const tags: Record<string, string> = {
    ingestion_health_from: from,
    ingestion_health_to: to,
    ingestion_health_status: to,
  }
  const extra = {
    reasons: evaluation.reasons,
    from,
    to,
  }
  const fp = sentryFingerprintArray(evaluation)

  if (to === 'critical') {
    const err = new Error(`LootAura ingestion health: critical (${evaluation.reasons.join(', ') || 'no reasons'})`)
    Sentry.captureException(err, {
      level: 'fatal',
      fingerprint: fp,
      tags,
      extra,
    })
    return
  }

  Sentry.captureMessage(`LootAura ingestion health: ${to}`, {
    level: 'warning',
    fingerprint: fp,
    tags,
    extra,
  })
}

function applyEmit(from: IngestionHealthStatus, to: IngestionHealthStatus, evaluation: IngestionHealthEvaluation, nowMs: number): void {
  emitSentry(from, to, evaluation)
  lastEmitted = {
    status: to,
    fingerprint: fingerprintIngestionHealth(evaluation),
    emittedAtMs: nowMs,
  }
}

export function reportIngestionHealthEvaluation(evaluation: IngestionHealthEvaluation, nowMs: number): void {
  const fp = fingerprintIngestionHealth(evaluation)
  if (lastEmitted && lastEmitted.fingerprint === fp) {
    return
  }

  const prevStatus: IngestionHealthStatus = lastEmitted?.status ?? 'healthy'

  if (evaluation.status === 'critical' && prevStatus === 'healthy') {
    const bridge: IngestionHealthEvaluation = {
      status: 'degraded',
      reasons: evaluation.reasons.length > 0 ? [...evaluation.reasons] : ['missing_signal'],
    }
    reportIngestionHealthEvaluation(bridge, nowMs)
    reportIngestionHealthEvaluation(evaluation, nowMs)
    return
  }

  if (!isTransitionAllowed(prevStatus, evaluation.status)) {
    return
  }

  applyEmit(prevStatus, evaluation.status, evaluation, nowMs)
}
