/**
 * Sparse parser health reporting: aggregate transitions only, in-process dedupe, conservative Sentry.
 */

import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents, type ObservabilityEventName } from '@/lib/observability/events'
import type { ParserDiagnosticsSnapshot } from '@/lib/parserRegression/buildParserDiagnostics'
import * as Sentry from '@sentry/nextjs'

type LastSignature = {
  failing: number
  degraded: number
  healthy: number
  staleFixtureTotal: number
}

let lastSig: LastSignature | null = null

export function resetParserHealthReporterForTests(): void {
  lastSig = null
}

function signatureOf(snapshot: ParserDiagnosticsSnapshot): LastSignature {
  const staleFixtureTotal = snapshot.sources.reduce((a, s) => a + s.staleFixtureCount, 0)
  return {
    failing: snapshot.summary.failing,
    degraded: snapshot.summary.degraded,
    healthy: snapshot.summary.healthy,
    staleFixtureTotal,
  }
}

function sameSig(a: LastSignature, b: LastSignature): boolean {
  return (
    a.failing === b.failing &&
    a.degraded === b.degraded &&
    a.healthy === b.healthy &&
    a.staleFixtureTotal === b.staleFixtureTotal
  )
}

function emit(name: ObservabilityEventName, fields: Record<string, unknown>): void {
  emitObservabilityRecord(buildTelemetryRecord(name, fields))
}

function sentryFp(parts: string[]): string[] {
  return ['parser-health', ...parts]
}

/**
 * Emits structured telemetry (and sparse Sentry messages) only when aggregate signature changes.
 */
export function reportParserHealthTransition(snapshot: ParserDiagnosticsSnapshot, nowMs: number): void {
  const next = signatureOf(snapshot)
  const prev = lastSig
  if (prev && sameSig(prev, next)) {
    return
  }

  const baseFields = { tMs: nowMs }

  const prevBad =
    prev && (prev.failing > 0 || prev.degraded > 0 || prev.staleFixtureTotal > 0)
  const nextGood = next.failing === 0 && next.degraded === 0 && next.staleFixtureTotal === 0
  if (prevBad && nextGood) {
    emit(ObservabilityEvents.parser.sourceRecovered, {
      ...baseFields,
      healthySourceCount: next.healthy,
      phase: 'parser_aggregate',
    })
    Sentry.captureMessage('LootAura parser health: aggregate recovered', {
      level: 'info',
      fingerprint: sentryFp(['recovered', 'aggregate']),
      tags: { parser_health: 'recovered' },
      extra: { healthy: next.healthy },
    })
  }

  const failingRising = (!prev || prev.failing === 0) && next.failing > 0
  if (failingRising) {
    emit(ObservabilityEvents.parser.sourceFailing, {
      ...baseFields,
      failingSourceCount: next.failing,
      degradedSourceCount: next.degraded,
      healthySourceCount: next.healthy,
    })
    Sentry.captureMessage('LootAura parser health: failing sources', {
      level: 'error',
      fingerprint: sentryFp(['failing']),
      tags: { parser_health: 'failing' },
      extra: { failing: next.failing, degraded: next.degraded },
    })
  }

  const degradedRising =
    (!prev || prev.degraded === 0) &&
    next.degraded > 0 &&
    next.failing === 0 &&
    (!prev || prev.failing === 0)
  if (degradedRising) {
    emit(ObservabilityEvents.parser.sourceDegraded, {
      ...baseFields,
      degradedSourceCount: next.degraded,
      healthySourceCount: next.healthy,
    })
    Sentry.captureMessage('LootAura parser health: degraded sources', {
      level: 'warning',
      fingerprint: sentryFp(['degraded']),
      tags: { parser_health: 'degraded' },
      extra: { degraded: next.degraded },
    })
  }

  const staleRising = (!prev || prev.staleFixtureTotal === 0) && next.staleFixtureTotal > 0
  if (staleRising) {
    emit(ObservabilityEvents.parser.fixtureStale, {
      ...baseFields,
      staleFixtureTotal: next.staleFixtureTotal,
      staleFixtureHostCount: snapshot.sources.filter((s) => s.staleFixtureCount > 0).length,
    })
  }

  lastSig = next
}
