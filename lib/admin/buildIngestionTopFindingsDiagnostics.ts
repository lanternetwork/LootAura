import { diagnosticBullet, formatDiagnosticCount } from '@/lib/admin/diagnosticsMarkdown'
import { buildOperationalPriorities, buildQueueHealthSummary } from '@/lib/admin/ingestionDashboardOverview'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

const MAX_FINDINGS = 6

function geocodePressureLabel(metrics: IngestionMetricsResponse): string {
  const bottleneck = metrics.volume.bottleneck
  const rate429 = metrics.volume.geocode.rate429Count24h
  if (bottleneck === 'db_provider_pressure') return 'active (db_provider_pressure)'
  if (rate429 > 0) return `elevated (429 count 24h: ${formatDiagnosticCount(rate429)})`
  return 'normal'
}

export function buildIngestionTopFindingsDiagnostics(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): string {
  const findings: string[] = []
  const queues = buildQueueHealthSummary(metrics, coverage)
  const cohort = metrics.addressEnrichmentDrainCohort

  if (cohort && cohort.total > 0) {
    const never = cohort.byFailureSubtype.never_attempted ?? 0
    if (never > 0) {
      findings.push(
        `${((never / cohort.total) * 100).toFixed(1)}% of enrichment cohort never attempted`
      )
    }
  }

  if (queues.catalogRepair > 0 && metrics.failureBreakdown.needs_check > 0) {
    const overlap = (metrics.failureBreakdown.needs_check / queues.catalogRepair) * 100
    findings.push(`needs_check represents ${overlap.toFixed(1)}% of repair backlog`)
  }

  if (coverage && coverage.missingValidYstmUrls > 0) {
    findings.push(`${coverage.missingValidYstmUrls.toLocaleString()} valid URLs remain missing`)
  }

  const publishedNotVisible =
    coverage?.falseExclusionAudit.byPrimaryBucket.published_not_visible ?? 0
  if (publishedNotVisible > 0) {
    findings.push(`published_not_visible contributes ${publishedNotVisible.toLocaleString()} rows`)
  }

  const duplicateClusters =
    coverage?.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? null
  if (duplicateClusters === 0) {
    findings.push('duplicate clusters remain within tolerance')
  } else if (duplicateClusters != null && duplicateClusters > 0) {
    findings.push(
      `${duplicateClusters.toLocaleString()} duplicate canonical publish cluster(s) detected`
    )
  }

  findings.push(`geocode pressure ${geocodePressureLabel(metrics)}`)

  for (const priority of buildOperationalPriorities(metrics, coverage)) {
    if (findings.length >= MAX_FINDINGS) break
    const line = `${priority.severity.toUpperCase()}: ${priority.issue}`
    if (!findings.includes(line)) {
      findings.push(line)
    }
  }

  const lines = ['## TOP FINDINGS', ...findings.slice(0, MAX_FINDINGS).map((f) => diagnosticBullet('finding', f))]

  if (findings.length === 0) {
    lines.push(diagnosticBullet('finding', 'No elevated findings in current snapshot'))
  }

  return lines.join('\n')
}
