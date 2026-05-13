/**
 * Tier 0 deterministic source degradation classification (pure).
 */

import type { ParserHealthCounts, ParserHealthReason, ParserHealthStatus } from '@/lib/parserRegression/parserHealth'
import type { FixtureFreshnessReason, FixtureFreshnessStatus } from '@/lib/parserRegression/fixtureFreshness'

export type SourceDegradationTag =
  | 'likely_selector_drift'
  | 'source_outage'
  | 'unsupported_layout_evolution'
  | 'extraction_collapse'

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(1, n)
}

export function buildSourceDegradationRow(params: {
  sourceHost: string
  health: { status: ParserHealthStatus; score: number; reasons: ParserHealthReason[] }
  freshnessStatus: FixtureFreshnessStatus
  freshnessReasons: FixtureFreshnessReason[]
  counts: ParserHealthCounts
}): { tags: SourceDegradationTag[]; recommendedAction: string } {
  const t = Math.max(1, params.counts.total)
  const mismatchR = clamp01(params.counts.fixtureMismatch / t)
  const zeroR = clamp01(params.counts.zeroListings / t)
  const selR = clamp01(params.counts.selectorMissing / t)
  const unsR = clamp01(params.counts.unsupportedLayout / t)
  const meanMs = params.counts.parseDurationSumMs / t

  const tags: SourceDegradationTag[] = []
  const reasons = new Set(params.health.reasons)

  if (selR >= 0.08 && (mismatchR >= 0.08 || reasons.has('high_fixture_mismatch_rate'))) {
    tags.push('likely_selector_drift')
  }
  if (zeroR >= 0.25 && (reasons.has('parse_duration_degraded') || meanMs >= 1200)) {
    tags.push('source_outage')
  }
  if (unsR >= 0.08 || reasons.has('high_unsupported_layout_rate')) {
    tags.push('unsupported_layout_evolution')
  }
  if (zeroR >= 0.35 || (reasons.has('high_zero_listing_rate') && reasons.has('high_extraction_empty_rate'))) {
    tags.push('extraction_collapse')
  }

  let recommendedAction = 'monitor_parser_regression_pass_rate'
  if (params.health.status === 'failing' || params.freshnessStatus === 'stale') {
    if (tags.includes('likely_selector_drift')) {
      recommendedAction = 'refresh_fixtures_and_audit_selectors'
    } else if (tags.includes('extraction_collapse')) {
      recommendedAction = 'investigate_extraction_pipeline_and_source_availability'
    } else if (tags.includes('unsupported_layout_evolution')) {
      recommendedAction = 'add_fixture_for_new_layout_and_update_parser'
    } else if (tags.includes('source_outage')) {
      recommendedAction = 'verify_source_reachability_and_fetch_path'
    } else if (params.freshnessReasons.some((r) => r === 'invalid_captured_at' || r === 'invalid_source_host' || r === 'metadata_shape_invalid')) {
      recommendedAction = 'repair_fixture_metadata_captured_at_source_host'
    } else {
      recommendedAction = 'refresh_stale_fixtures_and_re_run_regression'
    }
  } else if (params.health.status === 'degraded' || params.freshnessStatus === 'aging') {
    recommendedAction = 'schedule_fixture_refresh_and_watch_rates'
  }

  return { tags: [...new Set(tags)], recommendedAction }
}

export function summarizeSourceDegradation(
  rows: Array<{
    sourceHost: string
    healthStatus: ParserHealthStatus
    freshnessStatus: FixtureFreshnessStatus
    tags: SourceDegradationTag[]
    recommendedAction: string
  }>
): { degradedSources: string[]; failingSources: string[]; recommendedAction: string } {
  const failingSources = [
    ...new Set(
      rows
        .filter((r) => r.healthStatus === 'failing' || r.freshnessStatus === 'stale')
        .map((r) => r.sourceHost)
    ),
  ].sort()
  const degradedSources = [
    ...new Set(
      rows
        .filter(
          (r) =>
            (r.healthStatus === 'degraded' || r.freshnessStatus === 'aging') &&
            !failingSources.includes(r.sourceHost)
        )
        .map((r) => r.sourceHost)
    ),
  ].sort()

  let recommendedAction = 'monitor_parser_regression_pass_rate'
  if (failingSources.length > 0) {
    const first = rows.find((r) => failingSources.includes(r.sourceHost))
    recommendedAction = first?.recommendedAction ?? recommendedAction
  } else if (degradedSources.length > 0) {
    const first = rows.find((r) => degradedSources.includes(r.sourceHost))
    recommendedAction = first?.recommendedAction ?? 'schedule_fixture_refresh_and_watch_rates'
  }

  return { degradedSources, failingSources, recommendedAction }
}
