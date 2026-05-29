import { describe, it, expect } from 'vitest'
import { isSeoIndexRolloutReady, SEO_ROLLOUT_DISABLED_STATE } from '@/lib/seo/seoRolloutTypes'
import { enabledSeoRolloutState } from './seoRolloutTestHelpers'

describe('seoRolloutState', () => {
  it('fails closed when all attestations are off', () => {
    expect(isSeoIndexRolloutReady(SEO_ROLLOUT_DISABLED_STATE)).toBe(false)
  })

  it('requires public indexing, crawl, and search console attestations', () => {
    expect(isSeoIndexRolloutReady(enabledSeoRolloutState())).toBe(true)
    expect(
      isSeoIndexRolloutReady(enabledSeoRolloutState({ searchConsoleValidationPassed: false }))
    ).toBe(false)
  })
})
