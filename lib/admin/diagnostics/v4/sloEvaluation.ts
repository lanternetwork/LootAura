import {
  ACTIONABLE_MISSING_SLO_MAX,
  CANONICAL_KEY_COVERAGE_MIN_PCT,
  CATALOG_REPAIR_SLO_MAX,
  COVERAGE_SLO_MIN_PCT,
  DUPLICATE_CONVERGENCE_STREAK_TARGET_DAYS,
  PARSER_SUCCESS_MIN_RATE,
  PUBLISH_FAILED_SLO_MAX,
} from '@/lib/admin/diagnostics/v4/constants'
import type { SloEvaluationRow } from '@/lib/admin/diagnostics/v4/types'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { DETAIL_FIRST_SUCCESS_RATE_TARGET } from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

function formatPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export function evaluateIngestionSlos(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): SloEvaluationRow[] {
  const duplicateClusters = coverage?.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? null
  const streak =
    coverage?.crossProviderConvergence.sloAttainment?.consecutiveZeroDuplicateDays ?? 0
  const df = metrics.funnel['24h'].detailFirst
  const parserRate =
    df.attempted >= 20
      ? (df.providerGeocodeBypassRate ?? df.succeeded / df.attempted)
      : null
  const coveragePct = coverage?.coveragePct ?? null
  const repairQueue =
    coverage?.catalogRepair.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? 0
  const publishFailed = metrics.failureBreakdown.publish_failed
  const canonicalPct = coverage?.canonicalSaleInstance.canonicalCoveragePct ?? null
  const actionableMissing =
    coverage?.actionableMissingValid.effectiveMissingValidYstmUrls ?? null

  return [
    {
      id: 'duplicate_canonical_clusters',
      label: 'Duplicate canonical publish clusters = 0',
      pass: duplicateClusters === 0,
      actual: duplicateClusters == null ? 'unavailable' : String(duplicateClusters),
      target: '0',
      blocking: true,
    },
    {
      id: 'duplicate_convergence_streak',
      label: `Duplicate convergence streak (${DUPLICATE_CONVERGENCE_STREAK_TARGET_DAYS} UTC days)`,
      pass: streak >= DUPLICATE_CONVERGENCE_STREAK_TARGET_DAYS,
      actual: `${streak} / ${DUPLICATE_CONVERGENCE_STREAK_TARGET_DAYS}`,
      target: `${DUPLICATE_CONVERGENCE_STREAK_TARGET_DAYS} days`,
      blocking: false,
    },
    {
      id: 'parser_success_24h',
      label: `Parser success ≥${(PARSER_SUCCESS_MIN_RATE * 100).toFixed(0)}%`,
      pass:
        parserRate != null
          ? parserRate >= PARSER_SUCCESS_MIN_RATE
          : metrics.detailFirstProof.status === 'pass',
      actual:
        parserRate != null
          ? formatPct(parserRate)
          : metrics.detailFirstProof.status,
      target: `≥${(DETAIL_FIRST_SUCCESS_RATE_TARGET * 100).toFixed(0)}%`,
      blocking: true,
    },
    {
      id: 'coverage_pct',
      label: `Coverage ≥${COVERAGE_SLO_MIN_PCT}%`,
      pass: coveragePct != null && coveragePct >= COVERAGE_SLO_MIN_PCT,
      actual: coveragePct == null ? 'unavailable' : `${coveragePct.toFixed(1)}%`,
      target: `≥${COVERAGE_SLO_MIN_PCT}%`,
      blocking: false,
    },
    {
      id: 'catalog_repair_queue',
      label: `Catalog repair queue <${CATALOG_REPAIR_SLO_MAX}`,
      pass: repairQueue < CATALOG_REPAIR_SLO_MAX,
      actual: repairQueue.toLocaleString(),
      target: `<${CATALOG_REPAIR_SLO_MAX}`,
      blocking: false,
    },
    {
      id: 'publish_failed_terminal',
      label: `Terminal publish_failed ≤${PUBLISH_FAILED_SLO_MAX}`,
      pass: publishFailed <= PUBLISH_FAILED_SLO_MAX,
      actual: publishFailed.toLocaleString(),
      target: `≤${PUBLISH_FAILED_SLO_MAX}`,
      blocking: true,
    },
    {
      id: 'canonical_key_coverage',
      label: `Canonical key coverage ≥${CANONICAL_KEY_COVERAGE_MIN_PCT}%`,
      pass: canonicalPct != null && canonicalPct >= CANONICAL_KEY_COVERAGE_MIN_PCT,
      actual: canonicalPct == null ? 'unavailable' : `${canonicalPct.toFixed(1)}%`,
      target: `≥${CANONICAL_KEY_COVERAGE_MIN_PCT}%`,
      blocking: false,
    },
    {
      id: 'actionable_missing_valid',
      label: `Actionable missing valid ≤${ACTIONABLE_MISSING_SLO_MAX}`,
      pass: actionableMissing != null && actionableMissing <= ACTIONABLE_MISSING_SLO_MAX,
      actual: actionableMissing == null ? 'unavailable' : actionableMissing.toLocaleString(),
      target: `≤${ACTIONABLE_MISSING_SLO_MAX}`,
      blocking: false,
    },
  ]
}

export function getBlockingSloFailures(slos: readonly SloEvaluationRow[]): SloEvaluationRow[] {
  return slos.filter((row) => row.blocking && !row.pass)
}
