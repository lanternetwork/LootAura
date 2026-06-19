import { evaluateYstmSaleInstanceRolloutGates } from '@/lib/admin/evaluateYstmSaleInstanceRolloutGates'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING,
  CRAWL_SKIP_TAXONOMY_MIN_SAMPLES,
} from '@/lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth'

/** Client-safe mirror of `YSTM_COVERAGE_TARGET_PCT` in ystmCoverageValidity.ts (avoid server import chain). */
const YSTM_COVERAGE_TARGET_PCT = 90

export const STABILIZATION_MISSING_VALID_NEAR_ZERO = 15
export const STABILIZATION_CATALOG_REPAIR_MAX = 100
export const STABILIZATION_PUBLISH_FAILED_LOW_MAX = 50
export const STABILIZATION_CANONICAL_COVERAGE_MIN_PCT = 95
export const STABILIZATION_TIER1_HOLD_DAYS = 7

export type ExitCriterionStatus = 'pass' | 'fail' | 'pending'

export type ExitCriterion = {
  id: string
  label: string
  tier: 1 | 2
  status: ExitCriterionStatus
  detail: string
}

export type YstmStabilizationExitSnapshot = {
  tier1Ready: boolean
  tier2Ready: boolean
  tier1Criteria: ExitCriterion[]
  tier2Criteria: ExitCriterion[]
  /** 7-day consecutive hold is tracked in ops daily log — snapshot only reflects current point-in-time. */
  holdNote: string
}

function criterion(
  id: string,
  label: string,
  tier: 1 | 2,
  pass: boolean,
  detail: string,
  pending = false
): ExitCriterion {
  return {
    id,
    label,
    tier,
    status: pending ? 'pending' : pass ? 'pass' : 'fail',
    detail,
  }
}

export function evaluateYstmStabilizationExit(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): YstmStabilizationExitSnapshot {
  const tier1: ExitCriterion[] = []
  const tier2: ExitCriterion[] = []

  const coveragePct = coverage?.coveragePct ?? null
  tier1.push(
    criterion(
      'coverage_pct',
      `Coverage ≥${YSTM_COVERAGE_TARGET_PCT}%`,
      1,
      coveragePct != null && coveragePct >= YSTM_COVERAGE_TARGET_PCT,
      coveragePct == null ? 'Coverage unavailable' : `${coveragePct.toFixed(1)}%`
    )
  )

  const duplicateClusters = coverage?.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? null
  tier1.push(
    criterion(
      'duplicate_clusters',
      'Duplicate canonical publish clusters = 0',
      1,
      duplicateClusters === 0,
      duplicateClusters == null ? 'Convergence data unavailable' : String(duplicateClusters)
    )
  )

  const repairQueue =
    coverage?.catalogRepair.repairQueueTotal ??
    coverage?.pipelineBacklog.catalogRepairQueue ??
    0
  tier1.push(
    criterion(
      'catalog_repair',
      `Catalog repair queue <${STABILIZATION_CATALOG_REPAIR_MAX}`,
      1,
      repairQueue < STABILIZATION_CATALOG_REPAIR_MAX,
      repairQueue.toLocaleString()
    )
  )

  const missing = coverage?.missingValidYstmUrls ?? null
  const effectiveMissing = coverage?.actionableMissingValid?.effectiveMissingValidYstmUrls ?? null
  tier1.push(
    criterion(
      'missing_valid',
      `Missing valid URLs ≤${STABILIZATION_MISSING_VALID_NEAR_ZERO}`,
      1,
      missing != null && missing <= STABILIZATION_MISSING_VALID_NEAR_ZERO,
      missing == null ? 'Coverage unavailable' : missing.toLocaleString()
    )
  )
  tier1.push(
    criterion(
      'missing_valid_actionable_preview',
      `[preview] Effective missing valid URLs ≤${STABILIZATION_MISSING_VALID_NEAR_ZERO}`,
      1,
      effectiveMissing != null && effectiveMissing <= STABILIZATION_MISSING_VALID_NEAR_ZERO,
      effectiveMissing == null ? 'Coverage unavailable' : effectiveMissing.toLocaleString(),
      false
    )
  )

  tier1.push(
    criterion(
      'detail_first_proof',
      'Detail-first proof pass',
      1,
      metrics.detailFirstProof.status === 'pass',
      metrics.detailFirstProof.status
    )
  )

  const publishFailed = metrics.failureBreakdown.publish_failed
  tier1.push(
    criterion(
      'publish_failed',
      `Terminal publish_failed low (≤${STABILIZATION_PUBLISH_FAILED_LOW_MAX})`,
      1,
      publishFailed <= STABILIZATION_PUBLISH_FAILED_LOW_MAX,
      publishFailed.toLocaleString()
    )
  )

  const esnetOff =
    coverage != null && !coverage.esnetIngest.enabled && !coverage.esnetBootstrap.enabled
  tier1.push(
    criterion(
      'esnet_paused',
      'ES.net ingest + burst bootstrap off',
      1,
      esnetOff,
      coverage == null
        ? 'Coverage unavailable'
        : `ingest ${coverage.esnetIngest.enabled ? 'on' : 'off'}, bootstrap ${coverage.esnetBootstrap.enabled ? 'on' : 'off'}`
    )
  )

  const canonicalPct = coverage?.canonicalSaleInstance.canonicalCoveragePct ?? null
  tier2.push(
    criterion(
      'canonical_coverage',
      `Canonical key coverage ≥${STABILIZATION_CANONICAL_COVERAGE_MIN_PCT}%`,
      2,
      canonicalPct != null && canonicalPct >= STABILIZATION_CANONICAL_COVERAGE_MIN_PCT,
      canonicalPct == null ? '—' : `${canonicalPct.toFixed(1)}%`
    )
  )

  const crawl = metrics.volume.fetch.crawlSkipTaxonomy24h
  let suspiciousDetail = 'No classified skips'
  let suspiciousPass = true
  if (crawl && crawl.total >= CRAWL_SKIP_TAXONOMY_MIN_SAMPLES) {
    const share = crawl.suspicious / crawl.total
    suspiciousPass = share < CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING
    suspiciousDetail = `${(share * 100).toFixed(1)}% of classified skips (${crawl.suspicious}/${crawl.total})`
  }
  tier2.push(
    criterion(
      'suspicious_skips',
      `Suspicious crawl-skip share <${(CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING * 100).toFixed(0)}% or documented benign`,
      2,
      suspiciousPass,
      suspiciousDetail,
      !suspiciousPass
    )
  )

  const refreshStale = coverage?.pipelineBacklog.existingRefreshStale ?? coverage?.existingRefresh.staleOver12h ?? null
  tier2.push(
    criterion(
      'refresh_stale',
      'Existing refresh stale backlog flat/down',
      2,
      false,
      refreshStale == null ? 'Track daily in ops log' : refreshStale.toLocaleString(),
      true
    )
  )

  if (coverage) {
    const rollout = evaluateYstmSaleInstanceRolloutGates(coverage)
    tier2.push(
      criterion(
        'phase14_gates',
        'Phase 14 / convergence gates ready',
        2,
        rollout.crossProviderEnforcementReady && rollout.enforcementReady,
        `enforcement ${rollout.enforcementReady ? 'yes' : 'no'}, cross-provider ${rollout.crossProviderEnforcementReady ? 'yes' : 'no'}`
      )
    )
  } else {
    tier2.push(
      criterion(
        'phase14_gates',
        'Phase 14 / convergence gates ready',
        2,
        false,
        'Coverage unavailable',
        true
      )
    )
  }

  const tier1Ready = tier1.filter((c) => !c.id.endsWith('_preview')).every((c) => c.status === 'pass')
  const tier2Ready = tier2.every((c) => c.status === 'pass')

  return {
    tier1Ready,
    tier2Ready,
    tier1Criteria: tier1,
    tier2Criteria: tier2,
    holdNote: `Tier 1 requires ${STABILIZATION_TIER1_HOLD_DAYS} consecutive daily passes — this panel is a point-in-time snapshot only.`,
  }
}
