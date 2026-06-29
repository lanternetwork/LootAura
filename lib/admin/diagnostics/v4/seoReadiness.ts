import { evaluateSeoEnablementMetricGate } from '@/lib/seo/evaluateSeoEnablementGate'
import type { SeoReadinessSnapshot } from '@/lib/admin/diagnostics/v4/types'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  SEO_ENABLEMENT_COVERAGE_MIN_PCT,
  SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX,
  SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN,
} from '@/lib/seo/evaluateSeoEnablementGate'

export function buildSeoReadinessSnapshot(
  coverage: YstmCoverageMetricsResponse | null
): SeoReadinessSnapshot | null {
  if (!coverage) return null

  const metricGate = evaluateSeoEnablementMetricGate(coverage)
  const coveragePct = coverage.coveragePct ?? null
  const effectiveMissing = coverage.actionableMissingValid?.effectiveMissingValidYstmUrls ?? null
  const duplicateClusters =
    coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? null
  const publishedActive = coverage.publishedActiveLootAuraYstmUrls ?? null

  return {
    metricGatePass: metricGate.metricGatePass,
    criteria: [
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
    ],
  }
}
