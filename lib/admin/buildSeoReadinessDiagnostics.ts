import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  evaluateSeoEnablementMetricGate,
  SEO_ENABLEMENT_COVERAGE_MIN_PCT,
  SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX,
  SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN,
} from '@/lib/seo/evaluateSeoEnablementGate'

type SeoCriterionRow = {
  label: string
  pass: boolean
  actual: string
}

function evaluateSeoReadinessCriteria(coverage: YstmCoverageMetricsResponse): SeoCriterionRow[] {
  const coveragePct = coverage.coveragePct ?? null
  const effectiveMissing = coverage.actionableMissingValid?.effectiveMissingValidYstmUrls ?? null
  const duplicateClusters =
    coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? null
  const publishedActive = coverage.publishedActiveLootAuraYstmUrls ?? null

  return [
    {
      label: `coverage >= ${SEO_ENABLEMENT_COVERAGE_MIN_PCT}%`,
      pass: coveragePct != null && coveragePct >= SEO_ENABLEMENT_COVERAGE_MIN_PCT,
      actual: coveragePct == null ? 'unavailable' : `${coveragePct.toFixed(1)}%`,
    },
    {
      label: `effective_missing_valid <= ${SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX}`,
      pass: effectiveMissing != null && effectiveMissing <= SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX,
      actual: effectiveMissing == null ? 'unavailable' : effectiveMissing.toLocaleString(),
    },
    {
      label: 'duplicate_published_canonical_clusters == 0',
      pass: duplicateClusters === 0,
      actual: duplicateClusters == null ? 'unavailable' : String(duplicateClusters),
    },
    {
      label: `published_active_inventory >= ${SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN.toLocaleString()}`,
      pass: publishedActive != null && publishedActive >= SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN,
      actual: publishedActive == null ? 'unavailable' : publishedActive.toLocaleString(),
    },
  ]
}

export function buildSeoReadinessDiagnostics(
  _metrics: unknown,
  coverage: YstmCoverageMetricsResponse | null
): string | null {
  if (!coverage) return null

  const metricGate = evaluateSeoEnablementMetricGate(coverage)
  const criteria = evaluateSeoReadinessCriteria(coverage)

  const lines = [
    '## SEO READINESS',
    diagnosticBullet('SEO_ENABLEMENT metric gate', metricGate.metricGatePass ? 'PASS' : 'FAIL'),
    diagnosticBullet(
      'note',
      'SEO emission requires metric gate plus admin attestations (public indexing, crawl validation, Search Console). YSTM stabilization allowlist is separate.'
    ),
    '',
    '### Criteria',
    ...criteria.map(
      (row) => `- [${row.pass ? 'PASS' : 'FAIL'}] ${row.label}: ${row.actual}`
    ),
  ]

  return lines.join('\n')
}
