import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateWeekOneSprintGates } from '@/lib/admin/weekOneSprintGates'
import { evaluateYstmSaleInstanceRolloutGates } from '@/lib/admin/evaluateYstmSaleInstanceRolloutGates'

function bullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? value.toLocaleString('en-US') : value}`
}

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

/**
 * Markdown block for external marketplace coverage scoreboard (clipboard / support).
 */
export function buildYstmCoverageDiagnostics(data: YstmCoverageMetricsResponse): string {
  const ge = data.graphEnumeration
  const last = ge.lastDiscoveryRun
  const gates = evaluateWeekOneSprintGates(data)
  const rolloutGates = evaluateYstmSaleInstanceRolloutGates(data)

  const lines: string[] = [
    '## External marketplace nationwide coverage',
    bullet('generatedAt', data.generatedAt),
    bullet('coveragePct', formatPct(data.coveragePct)),
    bullet('validActiveYstmUrls (V)', data.validActiveYstmUrls),
    bullet('publishedVisibleInAudit', data.publishedVisibleInAuditFootprint),
    bullet('missingValidYstmUrls', data.missingValidYstmUrls),
    bullet('lastAuditAt', data.lastAuditAt ?? '—'),
    bullet(
      'coverage bootstrap',
      data.coverageBootstrap.enabled
        ? `on (enabled at: ${data.coverageBootstrap.enabledAt ?? '—'})`
        : `off${data.coverageBootstrap.disabledReason ? ` (${data.coverageBootstrap.disabledReason})` : ''}`
    ),
    '',
    '### Sale-instance identity (Phase 3)',
    bullet('external-source rows with sale_instance_key', data.saleInstanceIdentity.ystmRowsWithKey),
    bullet('active rows with key', data.saleInstanceIdentity.ystmActiveRowsWithKey),
    bullet('key collision groups', data.saleInstanceIdentity.keyCollisionGroups),
    bullet(
      'sample collision keys',
      data.saleInstanceIdentity.sampleCollisionKeys.join(', ') || 'none'
    ),
    '',
    '### Source URL alias history (Phase 4)',
    bullet('alias rows', data.sourceUrlAlias.totalAliasRows),
    '',
    '### False-exclusion audit (Phase 1)',
    bullet('missing traced', data.falseExclusionAudit.tracedCount),
    bullet(
      'top buckets',
      Object.entries(data.falseExclusionAudit.byPrimaryBucket)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, n]) => `${k}=${n}`)
        .join(', ') || 'none'
    ),
    '',
    '### Sale-instance shadow replay (Phase 9)',
    bullet('replayed missing URLs', data.saleInstanceShadowReplay.replayedCount),
    bullet('legacy would suppress', data.saleInstanceShadowReplay.oldSuppressCount),
    bullet('new would suppress', data.saleInstanceShadowReplay.newSuppressCount),
    bullet('new would publish', data.saleInstanceShadowReplay.wouldPublishCount),
    bullet(
      'old suppress → new publish',
      data.saleInstanceShadowReplay.divergenceOldSuppressNewPublishCount
    ),
    bullet('ambiguous (new)', data.saleInstanceShadowReplay.ambiguousCount),
    '',
    '### External source false exclusion / sale identity (Phase 13)',
    bullet('healthy', data.falseExclusionSaleIdentity.healthy ? 'yes' : 'no'),
    bullet('missing valid external listing URLs', data.falseExclusionSaleIdentity.missingValidYstmUrls),
    bullet('never attempted', data.falseExclusionSaleIdentity.missingNeverAttempted),
    bullet('URL match same dates (24h)', data.falseExclusionSaleIdentity.urlMatchSameDates),
    bullet('URL match dates changed (24h)', data.falseExclusionSaleIdentity.urlMatchDatesChanged),
    bullet('URL reuse detected', data.falseExclusionSaleIdentity.urlReuseDetected),
    bullet('new event same URL', data.falseExclusionSaleIdentity.newEventSameUrl),
    bullet('same event updated', data.falseExclusionSaleIdentity.sameEventUpdated),
    bullet('soft dedupe suppressed (24h)', data.falseExclusionSaleIdentity.softDedupeSuppressed),
    bullet('suspicious suppressions (24h)', data.falseExclusionSaleIdentity.suspiciousSuppressions),
    bullet('ambiguous requires review', data.falseExclusionSaleIdentity.ambiguousRequiresReview),
    bullet('sale instance key collisions', data.falseExclusionSaleIdentity.saleInstanceKeyCollisions),
    bullet(
      'coverage rows without match_method',
      data.falseExclusionSaleIdentity.coverageWithoutMatchMethod
    ),
    bullet(
      'coverage match_method breakdown',
      Object.entries(data.falseExclusionSaleIdentity.coverageMatchMethodCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}=${n}`)
        .join(', ') || 'none'
    ),
    bullet(
      'duplicate visible address+date clusters',
      data.falseExclusionSaleIdentity.duplicateVisibleSaleClusters24h
    ),
    bullet(
      'extra visible duplicate rows',
      data.falseExclusionSaleIdentity.duplicateVisibleSameAddressDate24h
    ),
    ...(data.falseExclusionSaleIdentity.alerts.length > 0
      ? [
          bullet(
            'alerts',
            data.falseExclusionSaleIdentity.alerts.map((a) => `${a.level}:${a.code}`).join('; ')
          ),
        ]
      : []),
    '',
    '### Week-1 sprint gates',
    ...gates.gates.map((g) => `- [${g.status.toUpperCase()}] ${g.label}: ${g.detail}`),
    bullet('all gates pass', gates.allPass ? 'yes' : 'no'),
    '',
    '### Sale-instance rollout gates (Phase 14)',
    bullet('observability ready (Stage A)', rolloutGates.observabilityReady ? 'yes' : 'no'),
    bullet('enforcement ready (Stage D)', rolloutGates.enforcementReady ? 'yes' : 'no'),
    ...rolloutGates.gates.map(
      (g) => `- [${g.status.toUpperCase()}] [${g.stage}] ${g.label}: ${g.detail}`
    ),
    '',
    '### Graph enumeration',
    bullet('catalogStates', ge.catalogStates),
    bullet('statesWithCandidates', ge.statesWithCandidates),
    bullet('candidatesDiscovered', ge.candidatesDiscovered),
    bullet('validatedPages', ge.validatedPages),
    bullet('pendingValidation', ge.pendingValidation),
    bullet('crawlableConfigs', ge.sourceExpansion.crawlableConfigs),
    bullet('noSourcePages', ge.sourceExpansion.configsWithoutSourcePages),
    bullet('validationsLast24h', ge.validationsLast24h),
    bullet('fetchFailureRate24h', `${Math.round(ge.fetchFailureRate24h * 100)}%`),
    bullet('blockRate24h', `${Math.round(ge.blockRate24h * 100)}%`),
    bullet('throttleRecommended', ge.throttleRecommended ? 'yes' : 'no'),
  ]

  if (last) {
    lines.push(
      '',
      '### Last discovery run',
      bullet('completedAt', last.completedAt),
      bullet('ok', last.ok ? 'yes' : 'no'),
      bullet('skipped', last.skipped ? 'yes' : 'no'),
      bullet('skipReason', last.skipReason ?? '—'),
      bullet('catalogSize', last.catalogSize ?? '—'),
      bullet('stateBatchPlanned', last.stateBatchPlanned ?? '—'),
      bullet('statesScanned', last.statesScanned),
      bullet('configsPromoted', last.configsPromoted),
      bullet('phasesCompleted', last.phasesCompleted.join(', ') || 'none'),
      bullet('degraded', last.degraded ? 'yes' : 'no'),
      bullet('graphEnumerationThrottled', last.graphEnumerationThrottled ? 'yes' : 'no')
    )
  }

  lines.push(
    '',
    '### Pipeline backlog',
    bullet('catalogRepairQueue', data.pipelineBacklog.catalogRepairQueue),
    bullet('missingIngestionNeverAttempted', data.pipelineBacklog.missingIngestionNeverAttempted),
    bullet('existingRefreshStale', data.pipelineBacklog.existingRefreshStale),
    '',
    '### G4 (not week-1 target)',
    bullet(
      'G4 hold days',
      `${data.sloAttainment.consecutiveDaysAtTarget}/${data.sloAttainment.requiredConsecutiveDays}`
    ),
    bullet('footprintMeetsMinimum', data.sloAttainment.footprintMeetsProgramMinimum ? 'yes' : 'no')
  )

  return lines.join('\n')
}
