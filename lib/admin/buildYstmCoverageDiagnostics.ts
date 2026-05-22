import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateWeekOneSprintGates } from '@/lib/admin/weekOneSprintGates'

function bullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? value.toLocaleString('en-US') : value}`
}

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

/**
 * Markdown block for YSTM coverage scoreboard (clipboard / support).
 */
export function buildYstmCoverageDiagnostics(data: YstmCoverageMetricsResponse): string {
  const ge = data.graphEnumeration
  const last = ge.lastDiscoveryRun
  const gates = evaluateWeekOneSprintGates(data)

  const lines: string[] = [
    '## YSTM nationwide coverage',
    bullet('generatedAt', data.generatedAt),
    bullet('coveragePct', formatPct(data.coveragePct)),
    bullet('validActiveYstmUrls (V)', data.validActiveYstmUrls),
    bullet('publishedVisibleInAudit', data.publishedVisibleInAuditFootprint),
    bullet('missingValidYstmUrls', data.missingValidYstmUrls),
    bullet('lastAuditAt', data.lastAuditAt ?? '—'),
    '',
    '### Sale-instance identity (Phase 3)',
    bullet('YSTM rows with sale_instance_key', data.saleInstanceIdentity.ystmRowsWithKey),
    bullet('active rows with key', data.saleInstanceIdentity.ystmActiveRowsWithKey),
    bullet('key collision groups', data.saleInstanceIdentity.keyCollisionGroups),
    bullet(
      'sample collision keys',
      data.saleInstanceIdentity.sampleCollisionKeys.join(', ') || 'none'
    ),
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
    '### Week-1 sprint gates',
    ...gates.gates.map((g) => `- [${g.status.toUpperCase()}] ${g.label}: ${g.detail}`),
    bullet('all gates pass', gates.allPass ? 'yes' : 'no'),
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
