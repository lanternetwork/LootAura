/** Client-safe SEO rollout types and constants (no server/DB imports). */

export type SeoRolloutAttestationTarget =
  | 'public_indexing'
  | 'crawl_validation'
  | 'search_console'

export type SeoRolloutRuntimeState = {
  publicIndexingEnabled: boolean
  publicIndexingEnabledAt: string | null
  publicIndexingDisabledAt: string | null
  crawlValidationPassed: boolean
  crawlValidationPassedAt: string | null
  searchConsoleValidationPassed: boolean
  searchConsoleValidationPassedAt: string | null
}

export const SEO_ROLLOUT_DISABLED_STATE: SeoRolloutRuntimeState = {
  publicIndexingEnabled: false,
  publicIndexingEnabledAt: null,
  publicIndexingDisabledAt: null,
  crawlValidationPassed: false,
  crawlValidationPassedAt: null,
  searchConsoleValidationPassed: false,
  searchConsoleValidationPassedAt: null,
}

export function isSeoIndexRolloutReady(state: SeoRolloutRuntimeState): boolean {
  return (
    state.publicIndexingEnabled &&
    state.crawlValidationPassed &&
    state.searchConsoleValidationPassed
  )
}
