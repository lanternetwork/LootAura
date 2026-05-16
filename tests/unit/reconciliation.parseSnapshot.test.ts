import { describe, expect, it } from 'vitest'
import { tryParseExternalPageListingForReconciliation } from '@/lib/reconciliation/reconciliationParseSnapshot'

describe('reconciliationParseSnapshot', () => {
  it('matches listing by normalized source URL', () => {
    const listingUrl = 'https://example.com/US/Illinois/Chicago/3805-N-Sacramento-Ave/161028326/listing.html'
    const html = `
      <a href="${listingUrl}">CAIT estate sale</a>
      <div>3805 N Sacramento Ave, Chicago, IL</div>
      <img src="https://cdn.example.com/item-1.jpg" />
    `
    const parsed = tryParseExternalPageListingForReconciliation({
      html,
      sourceUrl: listingUrl,
      city: 'Chicago',
      state: 'IL',
      sourcePlatform: 'external_page_source',
    })
    expect(parsed).not.toBeNull()
    expect(parsed?.title).toContain('CAIT')
    expect(parsed?.imageUrls.length).toBeGreaterThan(0)
  })
})
