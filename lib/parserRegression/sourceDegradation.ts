/**
 * Source degradation view: combines parser health + fixture freshness (pure).
 */

import type { FixtureFreshnessStatus } from '@/lib/parserRegression/fixtureFreshness'
import type {
  ParserHealthCounts,
  ParserHealthReason,
  ParserHealthResult,
  ParserHealthStatus,
} from '@/lib/parserRegression/parserHealth'

export type RecommendedParserAction =
  | 'none'
  | 'refresh_fixtures'
  | 'inspect_selectors'
  | 'verify_source_availability'
  | 'review_parser_thresholds'
  | 'investigate_extraction_collapse'
  | 'no_fixtures_root'

export type SourceParserHealthBundle = {
  sourceHost: string
  parserHealth: ParserHealthResult
  worstFixtureFreshness: FixtureFreshnessStatus
  /** True when any fixture metadata for this host failed validation. */
  hasInvalidFixtureMetadata: boolean
  fixtureCount: number
}

export type SourceDegradationResult = {
  degradedSources: string[]
  failingSources: string[]
  recommendedAction: RecommendedParserAction
  likelySelectorDriftHosts: string[]
  likelySourceOutageHosts: string[]
  likelyUnsupportedLayoutHosts: string[]
  likelyExtractionCollapseHosts: string[]
}

export type SourceDegradationTag =
  | 'selector_drift'
  | 'source_outage'
  | 'unsupported_layout'
  | 'extraction_collapse'
  | 'fixture_freshness'
  | 'metadata_invalid'

function rankFreshness(a: FixtureFreshnessStatus, b: FixtureFreshnessStatus): FixtureFreshnessStatus {
  const order: Record<FixtureFreshnessStatus, number> = { fresh: 0, aging: 1, stale: 2 }
  return order[a] >= order[b] ? a : b
}

/**
 * Combine parser health + worst per-host fixture freshness into operational severity.
 */
export function combineParserHealthAndFreshness(
  parser: ParserHealthResult,
  freshness: FixtureFreshnessStatus,
  hasInvalidFixtureMetadata: boolean
): ParserHealthStatus {
  if (hasInvalidFixtureMetadata || parser.status === 'failing') return 'failing'
  if (parser.status === 'degraded' || freshness === 'stale') return 'degraded'
  if (freshness === 'aging') return 'degraded'
  return parser.status
}

function reasonJoin(reasons: ParserHealthReason[]): string {
  return reasons.join('|')
}

function tagsForParserReasons(reasons: ParserHealthReason[]): SourceDegradationTag[] {
  const tags = new Set<SourceDegradationTag>()
  const rj = reasonJoin(reasons)
  if (rj.includes('high_selector_missing_rate')) tags.add('selector_drift')
  if (rj.includes('high_zero_listing_rate')) tags.add('source_outage')
  if (rj.includes('high_unsupported_layout_rate')) tags.add('unsupported_layout')
  if (
    rj.includes('high_fixture_mismatch_rate') ||
    rj.includes('high_malformed_source_rate') ||
    rj.includes('duplicate_suppression_anomaly') ||
    rj.includes('invalid_metrics')
  ) {
    tags.add('extraction_collapse')
  }
  return [...tags].sort()
}

function pickRecommendedAction(
  failing: string[],
  degraded: string[],
  selectorDrift: string[],
  outage: string[],
  layout: string[],
  collapse: string[]
): RecommendedParserAction {
  if (failing.length > 0) {
    if (collapse.length > 0 || outage.length > 0) return 'verify_source_availability'
    if (selectorDrift.length > 0) return 'inspect_selectors'
    if (layout.length > 0) return 'review_parser_thresholds'
    return 'investigate_extraction_collapse'
  }
  if (degraded.length > 0) {
    if (selectorDrift.length > 0) return 'inspect_selectors'
    return 'refresh_fixtures'
  }
  return 'none'
}

/**
 * Deterministic aggregation across hosts (no side effects).
 */
export function detectSourceDegradation(bundles: SourceParserHealthBundle[]): SourceDegradationResult {
  const degradedSources: string[] = []
  const failingSources: string[] = []
  const likelySelectorDriftHosts: string[] = []
  const likelySourceOutageHosts: string[] = []
  const likelyUnsupportedLayoutHosts: string[] = []
  const likelyExtractionCollapseHosts: string[] = []

  for (const b of bundles) {
    const combined = combineParserHealthAndFreshness(
      b.parserHealth,
      b.worstFixtureFreshness,
      b.hasInvalidFixtureMetadata
    )
    if (combined === 'failing') {
      failingSources.push(b.sourceHost)
    } else if (combined === 'degraded') {
      degradedSources.push(b.sourceHost)
    }

    const rj = reasonJoin(b.parserHealth.reasons)
    if (rj.includes('high_selector_missing_rate')) {
      likelySelectorDriftHosts.push(b.sourceHost)
    }
    if (rj.includes('high_zero_listing_rate')) {
      likelySourceOutageHosts.push(b.sourceHost)
    }
    if (rj.includes('high_unsupported_layout_rate')) {
      likelyUnsupportedLayoutHosts.push(b.sourceHost)
    }
    if (
      rj.includes('high_fixture_mismatch_rate') ||
      rj.includes('high_malformed_source_rate') ||
      rj.includes('duplicate_suppression_anomaly') ||
      rj.includes('invalid_metrics')
    ) {
      likelyExtractionCollapseHosts.push(b.sourceHost)
    }
    if (b.hasInvalidFixtureMetadata) {
      likelyExtractionCollapseHosts.push(b.sourceHost)
    }
  }

  const uniq = (xs: string[]) => [...new Set(xs)].sort()

  return {
    degradedSources: uniq(degradedSources),
    failingSources: uniq(failingSources),
    likelySelectorDriftHosts: uniq(likelySelectorDriftHosts),
    likelySourceOutageHosts: uniq(likelySourceOutageHosts),
    likelyUnsupportedLayoutHosts: uniq(likelyUnsupportedLayoutHosts),
    likelyExtractionCollapseHosts: uniq(likelyExtractionCollapseHosts),
    recommendedAction: pickRecommendedAction(
      uniq(failingSources),
      uniq(degradedSources),
      uniq(likelySelectorDriftHosts),
      uniq(likelySourceOutageHosts),
      uniq(likelyUnsupportedLayoutHosts),
      uniq(likelyExtractionCollapseHosts)
    ),
  }
}

export function rollupWorstFixtureFreshness(statuses: FixtureFreshnessStatus[]): FixtureFreshnessStatus {
  return statuses.reduce((acc, s) => rankFreshness(acc, s), 'fresh' as FixtureFreshnessStatus)
}

export function buildSourceDegradationRow(params: {
  sourceHost: string
  health: ParserHealthResult
  freshnessStatus: FixtureFreshnessStatus
  freshnessReasons: readonly string[]
  counts: ParserHealthCounts
}): { tags: SourceDegradationTag[]; recommendedAction: RecommendedParserAction } {
  const tags = new Set(tagsForParserReasons(params.health.reasons))
  if (params.freshnessStatus === 'aging' || params.freshnessStatus === 'stale') {
    tags.add('fixture_freshness')
  }
  if (params.sourceHost === '__invalid_metadata__') {
    tags.add('metadata_invalid')
  }

  const bundle: SourceParserHealthBundle = {
    sourceHost: params.sourceHost,
    parserHealth: params.health,
    worstFixtureFreshness: params.freshnessStatus,
    hasInvalidFixtureMetadata: params.sourceHost === '__invalid_metadata__',
    fixtureCount: Math.max(1, params.counts.total),
  }
  const { recommendedAction } = detectSourceDegradation([bundle])
  return { tags: [...tags].sort(), recommendedAction }
}

export type SourceDegradationSummaryInput = {
  sourceHost: string
  healthStatus: ParserHealthStatus
  freshnessStatus: FixtureFreshnessStatus
  tags: SourceDegradationTag[]
  recommendedAction: RecommendedParserAction
}

function combinedFixtureStatus(
  healthStatus: ParserHealthStatus,
  freshnessStatus: FixtureFreshnessStatus
): ParserHealthStatus {
  if (healthStatus === 'failing' || freshnessStatus === 'stale') return 'failing'
  if (healthStatus === 'degraded' || freshnessStatus === 'aging') return 'degraded'
  return healthStatus
}

/**
 * Roll up per-source rows into host lists + a single deterministic recommended action.
 */
export function summarizeSourceDegradation(rows: SourceDegradationSummaryInput[]): {
  degradedSources: string[]
  failingSources: string[]
  recommendedAction: RecommendedParserAction
} {
  const failingSources: string[] = []
  const degradedSources: string[] = []
  const sorted = [...rows].sort((a, b) => a.sourceHost.localeCompare(b.sourceHost))

  for (const r of sorted) {
    const c = combinedFixtureStatus(r.healthStatus, r.freshnessStatus)
    if (c === 'failing') failingSources.push(r.sourceHost)
    else if (c === 'degraded') degradedSources.push(r.sourceHost)
  }

  const uniq = (xs: string[]) => [...new Set(xs)].sort()
  const failingU = uniq(failingSources)
  const degradedU = uniq(degradedSources)

  const selectorDrift = sorted.filter((r) => r.tags.includes('selector_drift')).map((r) => r.sourceHost)
  const outage = sorted.filter((r) => r.tags.includes('source_outage')).map((r) => r.sourceHost)
  const layout = sorted.filter((r) => r.tags.includes('unsupported_layout')).map((r) => r.sourceHost)
  const collapse = sorted.filter((r) => r.tags.includes('extraction_collapse')).map((r) => r.sourceHost)

  return {
    failingSources: failingU,
    degradedSources: degradedU,
    recommendedAction: pickRecommendedAction(
      failingU,
      degradedU,
      uniq(selectorDrift),
      uniq(outage),
      uniq(layout),
      uniq(collapse)
    ),
  }
}
