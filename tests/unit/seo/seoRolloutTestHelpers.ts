import {
  SEO_ROLLOUT_DISABLED_STATE,
  type SeoRolloutRuntimeState,
} from '@/lib/seo/seoRolloutTypes'

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
