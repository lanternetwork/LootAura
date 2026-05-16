/**
 * Pure aggregation: scanned fixtures + optional runtime signals → per-host diagnostics payload.
 */

import { hashHostForLog } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import {
  defaultFixtureFreshnessThresholdsMs,
  evaluateFixtureFreshness,
  type FixtureFreshnessStatus,
} from '@/lib/parserRegression/fixtureFreshness'
import {
  classifyParserHealth,
  defaultParserHealthThresholds,
  type ParserHealthMetricsInput,
  type ParserHealthResult,
  type ParserHealthStatus,
} from '@/lib/parserRegression/parserHealth'
import type { ScannedParserFixtureRecord, ScannedParserFixtureError } from '@/lib/parserRegression/parserFixtureScan'
import {
  combineParserHealthAndFreshness,
  detectSourceDegradation,
  rollupWorstFixtureFreshness,
  type SourceParserHealthBundle,
} from '@/lib/parserRegression/sourceDegradation'

export type RuntimeParserSignalsByHost = Partial<Record<string, Partial<ParserHealthMetricsInput>>>

export type ParserHealthDiagnosticsSource = {
  sourceHost: string
  pageHostHash: string
  /** Parser classifier only (`classifyParserHealth`), before freshness/metadata combine. */
  parserStatus: ParserHealthStatus
  /** Combined operational status (parser + freshness + invalid metadata). */
  healthStatus: ParserHealthStatus
  freshnessStatus: FixtureFreshnessStatus
  score: number
  reasonList: string[]
  fixtureCount: number
  invalidFixtureCount: number
  /** Worst-case fixture age in ms (largest age among fixtures for this host). */
  maxFixtureAgeMs: number
}

/** Public admin API row: no hashes, paths, or fixture bodies. */
export type ParserHealthAdminApiSource = {
  sourceHost: string
  parserStatus: ParserHealthStatus
  freshnessStatus: FixtureFreshnessStatus
  score: number
  reasons: string[]
  fixtureCount: number
}

export type ParserHealthAdminApiResponse = {
  ok: true
  evaluatedAtMs: number
  sources: ParserHealthAdminApiSource[]
  summary: {
    healthy: number
    degraded: number
    failing: number
  }
}

/**
 * Deterministic JSON-safe view for `/api/admin/parser-health` (aggregate fields only).
 */
export function buildParserHealthAdminApiResponse(
  payload: ParserHealthDiagnosticsPayload
): ParserHealthAdminApiResponse {
  return {
    ok: true,
    evaluatedAtMs: payload.evaluatedAtMs,
    sources: payload.sources.map((s) => ({
      sourceHost: s.sourceHost,
      parserStatus: s.parserStatus,
      freshnessStatus: s.freshnessStatus,
      score: s.score,
      reasons: [...s.reasonList],
      fixtureCount: s.fixtureCount,
    })),
    summary: {
      healthy: payload.summary.healthy,
      degraded: payload.summary.degraded,
      failing: payload.summary.failing,
    },
  }
}

export type ParserHealthDiagnosticsSummary = {
  healthy: number
  degraded: number
  failing: number
  invalidMetadataCases: number
}

export type ParserHealthDiagnosticsPayload = {
  evaluatedAtMs: number
  sources: ParserHealthDiagnosticsSource[]
  summary: ParserHealthDiagnosticsSummary
  invalidFixtureCases: ScannedParserFixtureError[]
  degradation: ReturnType<typeof detectSourceDegradation>
  recommendedAction: string
}

function mergeSignals(
  base: ParserHealthMetricsInput,
  partial?: Partial<ParserHealthMetricsInput>
): ParserHealthMetricsInput {
  if (!partial) return base
  return {
    fixtureMismatchRate: partial.fixtureMismatchRate ?? base.fixtureMismatchRate,
    zeroListingRate: partial.zeroListingRate ?? base.zeroListingRate,
    selectorMissingRate: partial.selectorMissingRate ?? base.selectorMissingRate,
    malformedSourceRate: partial.malformedSourceRate ?? base.malformedSourceRate,
    unsupportedLayoutRate: partial.unsupportedLayoutRate ?? base.unsupportedLayoutRate,
    averageParseDurationMs: partial.averageParseDurationMs ?? base.averageParseDurationMs,
    duplicateSuppressionAnomalyRate:
      partial.duplicateSuppressionAnomalyRate ?? base.duplicateSuppressionAnomalyRate,
  }
}

function defaultNeutralSignals(): ParserHealthMetricsInput {
  return {
    fixtureMismatchRate: 0,
    zeroListingRate: 0,
    selectorMissingRate: 0,
    malformedSourceRate: 0,
    unsupportedLayoutRate: 0,
    averageParseDurationMs: 0,
    duplicateSuppressionAnomalyRate: 0,
  }
}

/**
 * Build aggregate diagnostics from scanned fixtures + optional runtime overrides per host.
 */
export function buildParserHealthDiagnosticsPayload(params: {
  evaluatedAtMs: number
  fixtures: ScannedParserFixtureRecord[]
  invalid: ScannedParserFixtureError[]
  runtimeByHost?: RuntimeParserSignalsByHost
}): ParserHealthDiagnosticsPayload {
  const { evaluatedAtMs, fixtures, invalid, runtimeByHost } = params
  const freshnessThresholds = defaultFixtureFreshnessThresholdsMs()
  const healthThresholds = defaultParserHealthThresholds()

  const byHost = new Map<
    string,
    {
      fixtureCount: number
      freshnessStatuses: FixtureFreshnessStatus[]
      invalidCount: number
      maxAgeMs: number
    }
  >()

  function hostKeyForInvalidFixture(inv: ScannedParserFixtureError): string {
    const hint = inv.sourceHostHint?.trim().toLowerCase()
    if (hint) return hint
    return `__fixture_metadata_errors__/${inv.sourceDir}`
  }

  for (const inv of invalid) {
    const host = hostKeyForInvalidFixture(inv)
    const cur = byHost.get(host) ?? {
      fixtureCount: 0,
      freshnessStatuses: [] as FixtureFreshnessStatus[],
      invalidCount: 0,
      maxAgeMs: 0,
    }
    cur.invalidCount += 1
    byHost.set(host, cur)
  }

  for (const f of fixtures) {
    const host = f.metadata.source_host
    const cur = byHost.get(host) ?? {
      fixtureCount: 0,
      freshnessStatuses: [] as FixtureFreshnessStatus[],
      invalidCount: 0,
      maxAgeMs: 0,
    }
    cur.fixtureCount += 1
    const fr = evaluateFixtureFreshness(f.metadata.captured_at, evaluatedAtMs, freshnessThresholds)
    cur.freshnessStatuses.push(fr.status)
    if (Number.isFinite(fr.ageMs)) {
      cur.maxAgeMs = Math.max(cur.maxAgeMs, fr.ageMs)
    }
    byHost.set(host, cur)
  }

  const bundles: SourceParserHealthBundle[] = []
  const sources: ParserHealthDiagnosticsSource[] = []

  let healthy = 0
  let degraded = 0
  let failing = 0

  for (const [sourceHost, agg] of [...byHost.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const worstFresh = rollupWorstFixtureFreshness(agg.freshnessStatuses)
    const neutral = defaultNeutralSignals()
    const merged = mergeSignals(neutral, runtimeByHost?.[sourceHost])
    const parserHealth: ParserHealthResult = classifyParserHealth(merged, healthThresholds)

    const hasInvalid = agg.invalidCount > 0
    const bundle: SourceParserHealthBundle = {
      sourceHost,
      parserHealth,
      worstFixtureFreshness: worstFresh,
      hasInvalidFixtureMetadata: hasInvalid,
      fixtureCount: agg.fixtureCount,
    }
    bundles.push(bundle)

    const combined = combineParserHealthAndFreshness(parserHealth, worstFresh, hasInvalid)

    if (combined === 'healthy') healthy += 1
    else if (combined === 'degraded') degraded += 1
    else failing += 1

    const reasonList = [
      ...parserHealth.reasons,
      ...(worstFresh !== 'fresh' ? [`fixture_freshness:${worstFresh}`] : []),
      ...(hasInvalid ? ['fixture_metadata_invalid'] : []),
    ]

    sources.push({
      sourceHost,
      pageHostHash: hashHostForLog(sourceHost),
      parserStatus: parserHealth.status,
      healthStatus: combined,
      freshnessStatus: worstFresh,
      score: parserHealth.score,
      reasonList: [...new Set(reasonList)].sort(),
      fixtureCount: agg.fixtureCount,
      invalidFixtureCount: agg.invalidCount,
      maxFixtureAgeMs: agg.maxAgeMs,
    })
  }

  const degradation = detectSourceDegradation(bundles)

  return {
    evaluatedAtMs,
    sources,
    summary: {
      healthy,
      degraded,
      failing,
      invalidMetadataCases: invalid.length,
    },
    invalidFixtureCases: invalid,
    degradation,
    recommendedAction: degradation.recommendedAction,
  }
}
