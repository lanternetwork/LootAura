import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  DUPLICATE_VISIBLE_CLUSTER_RATE_MAX,
  evaluateYstmSaleInstanceRolloutGates,
} from '@/lib/admin/evaluateYstmSaleInstanceRolloutGates'
import {
  evaluateYstmStabilizationExit,
  STABILIZATION_CANONICAL_COVERAGE_MIN_PCT,
  STABILIZATION_CATALOG_REPAIR_MAX,
  STABILIZATION_MISSING_VALID_NEAR_ZERO,
} from '@/lib/admin/ystmStabilizationExitCriteria'
import { isSeoPublicIndexingEnabled } from '@/lib/seo/constants'

export type SeoIndexGateStatus = 'pass' | 'fail' | 'pending' | 'blocked'

export type SeoIndexGate = {
  id: string
  label: string
  status: SeoIndexGateStatus
  detail: string
  source: 'tier1' | 'tier2' | 'phase14' | 'seo_kill_switch'
}

export type SeoIndexAllowlistSnapshot = {
  generatedAt: string
  /** Phase 0 master switch + operational gates. */
  indexingAllowed: boolean
  phase0Pass: boolean
  tier1Ready: boolean
  tier2Ready: boolean
  enforcementReady: boolean
  gates: SeoIndexGate[]
  blockers: string[]
}

function gateFromCriterion(
  criterion: { id: string; label: string; status: 'pass' | 'fail' | 'pending'; detail: string },
  source: SeoIndexGate['source']
): SeoIndexGate {
  return {
    id: criterion.id,
    label: criterion.label,
    status: criterion.status,
    detail: criterion.detail,
    source,
  }
}

/**
 * SEO index allowlist — derives from existing ingestion operational gates only.
 * No parallel SEO-only gate system.
 */
export function evaluateSeoIndexAllowlist(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): SeoIndexAllowlistSnapshot {
  const generatedAt = new Date().toISOString()
  const gates: SeoIndexGate[] = []
  const blockers: string[] = []

  const killSwitchOn = isSeoPublicIndexingEnabled()
  gates.push({
    id: 'seo_public_indexing_enabled',
    label: 'SEO_PUBLIC_INDEXING_ENABLED',
    status: killSwitchOn ? 'pass' : 'blocked',
    detail: killSwitchOn
      ? 'Explicit opt-in enabled'
      : 'Not set — Phase 0 blocks public indexing and sitemap inclusion',
    source: 'seo_kill_switch',
  })
  if (!killSwitchOn) {
    blockers.push('SEO_PUBLIC_INDEXING_ENABLED is not true (Phase 0)')
  }

  const exit = evaluateYstmStabilizationExit(metrics, coverage)
  for (const c of exit.tier1Criteria) {
    gates.push(gateFromCriterion(c, 'tier1'))
    if (c.status === 'fail') blockers.push(`Tier 1: ${c.label}`)
  }
  for (const c of exit.tier2Criteria) {
    gates.push(gateFromCriterion(c, 'tier2'))
    if (c.status === 'fail') blockers.push(`Tier 2: ${c.label}`)
  }

  let enforcementReady = false
  if (coverage) {
    const rollout = evaluateYstmSaleInstanceRolloutGates(coverage)
    enforcementReady = rollout.enforcementReady
    gates.push({
      id: 'phase14_enforcement',
      label: 'Phase 14 enforcement ready',
      status: rollout.enforcementReady ? 'pass' : 'fail',
      detail: rollout.enforcementReady ? 'yes' : 'no',
      source: 'phase14',
    })
    if (!rollout.enforcementReady) {
      blockers.push('Phase 14 enforcement not ready')
    }

    const publishedActive = coverage.publishedActiveLootAuraYstmUrls ?? 0
    const duplicateClusters =
      coverage.falseExclusionSaleIdentity?.duplicateVisibleSaleClusters24h ?? 0
    const duplicateRate = publishedActive > 0 ? duplicateClusters / publishedActive : 0
    const duplicateOk = duplicateRate < DUPLICATE_VISIBLE_CLUSTER_RATE_MAX
    gates.push({
      id: 'duplicate_visible_clusters',
      label: 'Duplicate visible clusters bounded',
      status: duplicateOk ? 'pass' : 'fail',
      detail: `${duplicateClusters} clusters / ${publishedActive} published-active (${(duplicateRate * 100).toFixed(2)}%)`,
      source: 'phase14',
    })
    if (!duplicateOk) {
      blockers.push('Duplicate visible sale clusters exceed threshold')
    }
  } else {
    gates.push({
      id: 'phase14_enforcement',
      label: 'Phase 14 enforcement ready',
      status: 'pending',
      detail: 'Coverage unavailable',
      source: 'phase14',
    })
    blockers.push('Coverage metrics unavailable')
  }

  /** Tier 2 `pending` criteria (e.g. refresh stale trend) are tracked but do not block indexing. */
  const tier2Failures = exit.tier2Criteria.filter((c) => c.status === 'fail')
  const tier2OperationalPass = tier2Failures.length === 0

  const phase0Pass = exit.tier1Ready && tier2OperationalPass && enforcementReady && killSwitchOn
  const indexingAllowed = phase0Pass && blockers.length === 0

  for (const c of tier2Failures) {
    blockers.push(`Tier 2: ${c.label}`)
  }

  return {
    generatedAt,
    indexingAllowed,
    phase0Pass,
    tier1Ready: exit.tier1Ready,
    tier2Ready: tier2OperationalPass,
    enforcementReady,
    gates,
    blockers: indexingAllowed ? [] : [...new Set(blockers)],
  }
}

/** Threshold constants re-exported for dashboards and docs. */
export const SEO_INDEX_ALLOWLIST_THRESHOLDS = {
  catalogRepairMax: STABILIZATION_CATALOG_REPAIR_MAX,
  missingValidMax: STABILIZATION_MISSING_VALID_NEAR_ZERO,
  canonicalCoverageMinPct: STABILIZATION_CANONICAL_COVERAGE_MIN_PCT,
  duplicateVisibleClusterRateMax: DUPLICATE_VISIBLE_CLUSTER_RATE_MAX,
} as const
