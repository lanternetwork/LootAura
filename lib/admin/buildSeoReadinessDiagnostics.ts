import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

const SEO_MISSING_VALID_MAX = 100

type SeoCriterionRow = {
  label: string
  pass: boolean
  actual: string
}

function evaluateSeoReadinessCriteria(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): SeoCriterionRow[] {
  const coveragePct = coverage?.coveragePct ?? null
  const repairQueue =
    coverage?.catalogRepair.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? 0
  const missing = coverage?.missingValidYstmUrls ?? null
  const duplicateClusters =
    coverage?.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? null
  const detailFirstPass = metrics.detailFirstProof.passed
  const esnetOff =
    coverage != null && !coverage.esnetIngest.enabled && !coverage.esnetBootstrap.enabled

  return [
    {
      label: 'coverage >= 90%',
      pass: coveragePct != null && coveragePct >= 90,
      actual: coveragePct == null ? 'unavailable' : `${coveragePct.toFixed(1)}%`,
    },
    {
      label: 'repair_queue < 100',
      pass: repairQueue < 100,
      actual: repairQueue.toLocaleString(),
    },
    {
      label: `missing_valid < ${SEO_MISSING_VALID_MAX}`,
      pass: missing != null && missing < SEO_MISSING_VALID_MAX,
      actual: missing == null ? 'unavailable' : missing.toLocaleString(),
    },
    {
      label: 'duplicate_clusters == 0',
      pass: duplicateClusters === 0,
      actual: duplicateClusters == null ? 'unavailable' : String(duplicateClusters),
    },
    {
      label: 'detail_first PASS',
      pass: detailFirstPass,
      actual: metrics.detailFirstProof.status,
    },
    {
      label: 'ES.net OFF',
      pass: esnetOff,
      actual:
        coverage == null
          ? 'unavailable'
          : `ingest ${coverage.esnetIngest.enabled ? 'on' : 'off'}, bootstrap ${coverage.esnetBootstrap.enabled ? 'on' : 'off'}`,
    },
  ]
}

export function buildSeoReadinessDiagnostics(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): string | null {
  if (!coverage) return null

  const criteria = evaluateSeoReadinessCriteria(metrics, coverage)
  const tier1Pass = criteria.every((row) => row.pass)

  const lines = [
    '## SEO READINESS',
    diagnosticBullet('tier1 stabilization', tier1Pass ? 'PASS' : 'FAIL'),
    diagnosticBullet(
      'note',
      'SEO unblock gate (missing_valid < 100). Stabilization Tier1 elsewhere uses missing_valid ≤ 15.'
    ),
    '',
    '### Criteria',
    ...criteria.map(
      (row) => `- [${row.pass ? 'PASS' : 'FAIL'}] ${row.label}: ${row.actual}`
    ),
  ]

  return lines.join('\n')
}
