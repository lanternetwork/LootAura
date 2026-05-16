/**
 * Sparse parser/source health transition reporting (aggregate hosts only).
 * Dedupes by deterministic fingerprint; emits telemetry + optional Sentry on allowed edges only.
 */

import * as Sentry from '@sentry/nextjs'
import { emitObservabilityRecord, buildTelemetryRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import { hashHostForLog } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import type { FixtureFreshnessStatus } from '@/lib/parserRegression/fixtureFreshness'
import type { ParserHealthStatus } from '@/lib/parserRegression/parserHealth'

export type ParserSourceEmissionSnapshot = {
  sourceHost: string
  combinedHealth: ParserHealthStatus
  fixtureFreshness: FixtureFreshnessStatus
  /** Classifier + freshness reason tokens; order ignored (sorted for fingerprint). */
  reasons: readonly string[]
}

type LastEmitted = {
  combinedHealth: ParserHealthStatus
  freshness: FixtureFreshnessStatus
  fingerprint: string
  emittedAtMs: number
}

const lastByHost = new Map<string, LastEmitted>()

export function resetParserHealthReporterForTests(): void {
  lastByHost.clear()
}

function normalizeHost(sourceHost: string): string {
  return sourceHost.trim().toLowerCase()
}

function reasonsKey(reasons: readonly string[]): string {
  return [...reasons].map((r) => String(r).trim()).filter(Boolean).sort().join('\u001e')
}

/** Deterministic dedupe key: host + combined status + freshness + sorted reasons. */
export function parserHealthTransitionFingerprint(
  sourceHost: string,
  combinedHealth: ParserHealthStatus,
  fixtureFreshness: FixtureFreshnessStatus,
  reasons: readonly string[]
): string {
  const host = normalizeHost(sourceHost)
  return `${host}|${combinedHealth}|${fixtureFreshness}|${reasonsKey(reasons)}`
}

function maybeEmitSentry(
  from: ParserHealthStatus,
  to: ParserHealthStatus,
  pageHostHash: string,
  reportToSentry: boolean,
  kind: 'degraded' | 'failing' | 'recovered'
): void {
  if (!reportToSentry) return
  const tags: Record<string, string> = {
    parser_health_from: from,
    parser_health_to: to,
    page_host_hash: pageHostHash,
  }
  const extra = { from, to, pageHostHash }

  if (kind === 'failing') {
    const err = new Error('LootAura parser health: failing')
    Sentry.captureException(err, {
      level: 'error',
      fingerprint: ['parser-source-health', pageHostHash, 'failing'],
      tags,
      extra,
    })
    return
  }
  if (kind === 'recovered') {
    Sentry.captureMessage('LootAura parser health: recovered', {
      level: 'info',
      fingerprint: ['parser-source-health', pageHostHash, 'recovered'],
      tags,
      extra,
    })
    return
  }
  Sentry.captureMessage('LootAura parser health: degraded', {
    level: 'warning',
    fingerprint: ['parser-source-health', pageHostHash, 'degraded'],
    tags,
    extra,
  })
}

/**
 * Reports transitions per host (aggregate snapshots only; no per-fixture / per-row loops).
 * Allowed telemetry edges: healthy→degraded, degraded→failing (and direct healthy→failing),
 * failing→healthy, degraded→healthy; fixture stale when freshness first becomes stale.
 * First observation healthy+fresh seeds cache without emit (cold-start anti-spam).
 */
export function reportParserHealthTransitions(
  snapshots: ParserSourceEmissionSnapshot[],
  nowMs: number,
  options?: { reportToSentry?: boolean }
): void {
  const reportToSentry = options?.reportToSentry === true
  for (const snap of snapshots) {
    const host = normalizeHost(snap.sourceHost)
    if (!host || host.startsWith('_')) continue

    const pageHostHash = hashHostForLog(host)
    const fp = parserHealthTransitionFingerprint(host, snap.combinedHealth, snap.fixtureFreshness, snap.reasons)
    const prev = lastByHost.get(host)

    if (prev && prev.fingerprint === fp) {
      continue
    }

    const prevCombined: ParserHealthStatus = prev?.combinedHealth ?? 'healthy'
    const prevFresh: FixtureFreshnessStatus = prev?.freshness ?? 'fresh'

    if (!prev && snap.combinedHealth === 'healthy' && snap.fixtureFreshness === 'fresh') {
      lastByHost.set(host, {
        combinedHealth: snap.combinedHealth,
        freshness: snap.fixtureFreshness,
        fingerprint: fp,
        emittedAtMs: nowMs,
      })
      continue
    }

    if (snap.fixtureFreshness === 'stale' && prevFresh !== 'stale') {
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.parser.fixtureStale, {
          pageHostHash,
          transition: 'into_stale',
        })
      )
    }

    if (snap.combinedHealth === 'degraded' && prevCombined === 'healthy') {
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.parser.sourceDegraded, {
          pageHostHash,
          transition: 'healthy_to_degraded',
        })
      )
      maybeEmitSentry(prevCombined, 'degraded', pageHostHash, reportToSentry, 'degraded')
    }

    if (snap.combinedHealth === 'failing' && prevCombined !== 'failing') {
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.parser.sourceFailing, {
          pageHostHash,
          transition: 'into_failing',
        })
      )
      maybeEmitSentry(prevCombined, 'failing', pageHostHash, reportToSentry, 'failing')
    }

    if (
      snap.combinedHealth === 'healthy' &&
      (prevCombined === 'degraded' || prevCombined === 'failing')
    ) {
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.parser.sourceRecovered, {
          pageHostHash,
          transition: 'to_healthy',
        })
      )
      maybeEmitSentry(prevCombined, 'healthy', pageHostHash, reportToSentry, 'recovered')
    }

    lastByHost.set(host, {
      combinedHealth: snap.combinedHealth,
      freshness: snap.fixtureFreshness,
      fingerprint: fp,
      emittedAtMs: nowMs,
    })
  }
}
