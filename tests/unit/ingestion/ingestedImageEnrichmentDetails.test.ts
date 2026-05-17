import { describe, expect, it } from 'vitest'
import {
  mergeIngestedImageEnrichmentDetails,
  shouldSkipRedundantDetailImageFetch,
} from '@/lib/ingestion/images/ingestedImageEnrichmentDetails'

describe('shouldSkipRedundantDetailImageFetch', () => {
  it('returns true when detail HTML was parsed within cooldown', () => {
    const failureDetails = mergeIngestedImageEnrichmentDetails(null, {
      detailHtmlParsed: true,
      detailAttemptSource: 'address_enrichment',
      skipReason: 'no_valid_urls',
    })
    expect(shouldSkipRedundantDetailImageFetch(failureDetails, 15, Date.now())).toBe(true)
  })

  it('returns false when last parse is outside cooldown', () => {
    const failureDetails = mergeIngestedImageEnrichmentDetails(null, {
      detailHtmlParsed: true,
      recorded_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    })
    expect(shouldSkipRedundantDetailImageFetch(failureDetails, 15, Date.now())).toBe(false)
  })

  it('returns false when no prior detail parse metadata exists', () => {
    expect(shouldSkipRedundantDetailImageFetch(null, 15)).toBe(false)
  })
})
