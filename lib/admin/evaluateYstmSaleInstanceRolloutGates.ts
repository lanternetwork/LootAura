import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

/** Spec Phase 13 / PR #488: duplicate-visible clusters vs published active YSTM sales. */
export const DUPLICATE_VISIBLE_CLUSTER_RATE_MAX = 0.005

/** Minimum share of published-active YSTM rows with sale_instance_key before enforcement (Stage D). */
export const ACTIVE_IDENTITY_KEY_COVERAGE_MIN = 0.95

export type YstmSaleInstanceRolloutGateStatus = 'pass' | 'fail' | 'pending'

export type YstmSaleInstanceRolloutGate = {
  id: string
  label: string
  stage: 'A' | 'B' | 'C' | 'D'
  status: YstmSaleInstanceRolloutGateStatus
  detail: string
}

export type YstmSaleInstanceRolloutGatesSnapshot = {
  generatedAt: string
  gates: YstmSaleInstanceRolloutGate[]
  /** Stage D enforcement gates (classifier + schema) all pass. */
  enforcementReady: boolean
  /** Stage A observability gates all pass. */
  observabilityReady: boolean
}

function gateStatus(pass: boolean, pending: boolean): YstmSaleInstanceRolloutGateStatus {
  if (pass) return 'pass'
  if (pending) return 'pending'
  return 'fail'
}

/**
 * Phase 14: rollout readiness gates for the sale-instance identity program.
 * Pure evaluation from scoreboard payload — no I/O.
 */
export function evaluateYstmSaleInstanceRolloutGates(
  data: YstmCoverageMetricsResponse,
  nowMs: number = Date.now()
): YstmSaleInstanceRolloutGatesSnapshot {
  const missing = data.missingValidYstmUrls
  const replay = data.saleInstanceShadowReplay
  const identity = data.saleInstanceIdentity
  const dash = data.falseExclusionSaleIdentity
  const publishedActive = data.publishedActiveLootAuraYstmUrls

  const shadowReplayComplete =
    missing === 0 || replay.replayedCount >= missing
  const shadowDivergenceClear = replay.divergenceOldSuppressNewPublishCount === 0
  const traceComplete =
    missing === 0 || data.falseExclusionAudit.tracedCount >= missing

  const activeKeyShare =
    publishedActive > 0 ? identity.ystmActiveRowsWithKey / publishedActive : 1
  const identityBackfillReady = activeKeyShare >= ACTIVE_IDENTITY_KEY_COVERAGE_MIN

  const duplicateClusterRate =
    publishedActive > 0 ? dash.duplicateVisibleSaleClusters24h / publishedActive : 0
  const duplicateVisibleOk = duplicateClusterRate < DUPLICATE_VISIBLE_CLUSTER_RATE_MAX

  const matchMethodPopulated =
    missing === 0 || dash.coverageWithoutMatchMethod === 0

  const ambiguousBounded =
    replay.replayedCount === 0 ||
    dash.ambiguousRequiresReview / Math.max(replay.replayedCount, 1) <= 0.05

  const canonical = data.canonicalSaleInstance
  const crossShadow = data.crossProviderShadow
  const canonicalCoverageReady =
    canonical.canonicalCoveragePct != null && canonical.canonicalCoveragePct >= 95
  const shadowFalseNegativeClear = crossShadow.falseNegativeCount7d === 0

  const gates: YstmSaleInstanceRolloutGate[] = [
    {
      id: 'false_exclusion_traced',
      label: 'Missing URLs traced (Phase 1)',
      stage: 'A',
      status: gateStatus(traceComplete, missing > 0 && !traceComplete),
      detail: `${data.falseExclusionAudit.tracedCount.toLocaleString()} / ${missing.toLocaleString()} missing traced`,
    },
    {
      id: 'shadow_replay_complete',
      label: 'Shadow replay queue drained (Phase 9)',
      stage: 'A',
      status: gateStatus(shadowReplayComplete, missing > 0 && !shadowReplayComplete),
      detail: `${replay.replayedCount.toLocaleString()} replayed · ${missing.toLocaleString()} missing valid`,
    },
    {
      id: 'shadow_no_divergence',
      label: 'No legacy-suppress → new-publish divergence',
      stage: 'D',
      status: shadowDivergenceClear ? 'pass' : 'fail',
      detail: `${replay.divergenceOldSuppressNewPublishCount.toLocaleString()} divergence row(s) — review before enforcement`,
    },
    {
      id: 'identity_active_key_coverage',
      label: 'Active external-source rows with sale_instance_key',
      stage: 'C',
      status: gateStatus(
        identityBackfillReady,
        !identityBackfillReady && identity.ystmActiveRowsWithKey > 0
      ),
      detail: `${identity.ystmActiveRowsWithKey.toLocaleString()} / ${publishedActive.toLocaleString()} published-active (${(activeKeyShare * 100).toFixed(1)}%; target ≥${(ACTIVE_IDENTITY_KEY_COVERAGE_MIN * 100).toFixed(0)}%)`,
    },
    {
      id: 'no_active_key_collisions',
      label: 'No active sale_instance_key collision groups',
      stage: 'C',
      status: identity.keyCollisionGroups === 0 ? 'pass' : 'fail',
      detail:
        identity.keyCollisionGroups === 0
          ? 'none detected'
          : `${identity.keyCollisionGroups.toLocaleString()} collision group(s)`,
    },
    {
      id: 'coverage_match_method',
      label: 'Coverage observations have match_method',
      stage: 'B',
      status: gateStatus(matchMethodPopulated, missing > 0 && !matchMethodPopulated),
      detail:
        missing === 0
          ? 'no missing valid-active rows'
          : `${dash.coverageWithoutMatchMethod.toLocaleString()} missing row(s) without match_method — re-run coverage audit`,
    },
    {
      id: 'duplicate_visible_slo',
      label: 'Duplicate-visible clusters (<0.5% of published active)',
      stage: 'D',
      status: duplicateVisibleOk ? 'pass' : 'fail',
      detail: `${dash.duplicateVisibleSaleClusters24h.toLocaleString()} clusters / ${publishedActive.toLocaleString()} published-active (${(duplicateClusterRate * 100).toFixed(2)}%; max ${(DUPLICATE_VISIBLE_CLUSTER_RATE_MAX * 100).toFixed(2)}%)`,
    },
    {
      id: 'ambiguous_review_bounded',
      label: 'Ambiguous classifier outcomes bounded',
      stage: 'D',
      status: ambiguousBounded ? 'pass' : 'fail',
      detail: `${dash.ambiguousRequiresReview.toLocaleString()} ambiguous of ${replay.replayedCount.toLocaleString()} replayed`,
    },
    {
      id: 'false_exclusion_dashboard',
      label: 'False-exclusion / sale-identity dashboard healthy',
      stage: 'A',
      status: dash.healthy ? 'pass' : 'fail',
      detail: dash.healthy
        ? 'no operational alerts'
        : `${dash.alerts.length.toLocaleString()} alert(s) — see Phase 13 panel`,
    },
    {
      id: 'canonical_key_coverage',
      label: 'Canonical sale key coverage (Phase A exit)',
      stage: 'A',
      status: gateStatus(
        canonicalCoverageReady,
        canonical.externalActiveEligible > 0 && !canonicalCoverageReady
      ),
      detail:
        canonical.canonicalCoveragePct != null
          ? `${canonical.canonicalCoveragePct.toFixed(1)}% active external rows (target ≥95%)`
          : 'no active external rows',
    },
    {
      id: 'cross_provider_shadow_false_negative',
      label: 'Cross-provider shadow false negatives (7d)',
      stage: 'B',
      status: shadowFalseNegativeClear ? 'pass' : 'fail',
      detail: `${crossShadow.falseNegativeCount7d.toLocaleString()} false negative(s) in 7d · ${crossShadow.shadowRecords24h.toLocaleString()} shadow row(s) in 24h`,
    },
  ]

  const observabilityIds = new Set([
    'false_exclusion_traced',
    'shadow_replay_complete',
    'false_exclusion_dashboard',
    'canonical_key_coverage',
  ])
  const enforcementIds = new Set([
    'shadow_no_divergence',
    'identity_active_key_coverage',
    'no_active_key_collisions',
    'coverage_match_method',
    'duplicate_visible_slo',
    'ambiguous_review_bounded',
  ])

  const observabilityReady = gates
    .filter((g) => observabilityIds.has(g.id))
    .every((g) => g.status === 'pass')
  const enforcementReady = gates
    .filter((g) => enforcementIds.has(g.id))
    .every((g) => g.status === 'pass')

  return {
    generatedAt: new Date(nowMs).toISOString(),
    gates,
    observabilityReady,
    enforcementReady,
  }
}
