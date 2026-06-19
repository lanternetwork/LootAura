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
  const effectiveMissing = coverage?.actionableMissingValid?.effectiveMissingValidYstmUrls ?? null
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
      label: `[preview] effective_missing_valid < ${SEO_MISSING_VALID_MAX}`,
      pass: effectiveMissing != null && effectiveMissing < SEO_MISSING_VALID_MAX,
      actual: effectiveMissing == null ? 'unavailable' : effectiveMissing.toLocaleString(),
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
  const tier1Pass = criteria.filter((row) => !row.label.startsWith('[preview]')).every((row) => row.pass)

  const lines = [
    '## SEO READINESS',
    diagnosticBullet('tier1 stabilization', tier1Pass ? 'PASS' : 'FAIL'),
    diagnosticBullet(
      'note',
      'SEO unblock gate (missing_valid < 100). Stabilization Tier1 elsewhere uses missing_valid ≤ 15. [preview] rows use effective_missing_valid only — gate pass/fail unchanged until approved.'
    ),
    '',
    '### Criteria',
    ...criteria.map(
      (row) => `- [${row.pass ? 'PASS' : 'FAIL'}] ${row.label}: ${row.actual}`
    ),
  ]

  return lines.join('\n')
}
