import {
  SEO_ROLLOUT_DISABLED_STATE,
  type SeoRolloutRuntimeState,
} from '@/lib/seo/seoRolloutTypes'

import { minimalYstmCoverageScoreboard } from '@/tests/unit/admin/evaluateYstmSaleInstanceRolloutGates.test'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

export function enabledSeoRolloutState(
  overrides: Partial<SeoRolloutRuntimeState> = {}
): SeoRolloutRuntimeState {
  return {
    ...SEO_ROLLOUT_DISABLED_STATE,
    publicIndexingEnabled: true,
    publicIndexingEnabledAt: '2026-05-29T00:00:00.000Z',
    crawlValidationPassed: true,
    crawlValidationPassedAt: '2026-05-29T00:00:00.000Z',
    searchConsoleValidationPassed: true,
    searchConsoleValidationPassedAt: '2026-05-29T00:00:00.000Z',
    ...overrides,
  }
}

/** Coverage fixture that passes SEO_ENABLEMENT_V2.1 metric gate thresholds. */
export function healthyEnablementCoverage(
  overrides: Partial<YstmCoverageMetricsResponse> = {}
): YstmCoverageMetricsResponse {
  const base = minimalYstmCoverageScoreboard()
  return minimalYstmCoverageScoreboard({
    ...base,
    coveragePct: 98.5,
    publishedActiveLootAuraYstmUrls: 2500,
    crossProviderConvergence: {
      ...base.crossProviderConvergence,
      duplicatePublishedCanonicalClusters: 0,
    },
    actionableMissingValid: {
      ...base.actionableMissingValid!,
      effectiveMissingValidYstmUrls: 37,
    },
    ...overrides,
  })
}
