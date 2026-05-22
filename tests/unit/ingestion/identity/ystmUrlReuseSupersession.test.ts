import { describe, expect, it } from 'vitest'
import { planYstmUrlReuseSupersessionOnDetailRefresh } from '@/lib/ingestion/identity/ystmUrlReuseSupersession'

describe('planYstmUrlReuseSupersessionOnDetailRefresh', () => {
  it('clears publish link and records superseded sale when instance key changes', () => {
    const patch = planYstmUrlReuseSupersessionOnDetailRefresh({
      prior: {
        id: 'ing-1',
        sale_instance_key: 'external_page_source:TX|austin|addr:2026-06-01|2026-06-02:111',
        published_sale_id: 'sale-old',
        date_start: '2026-06-01',
        date_end: '2026-06-02',
        status: 'published',
        failure_reasons: [],
        normalized_address: '123 main st',
      },
      nextSaleInstanceKey: 'external_page_source:TX|austin|addr:2026-07-10|2026-07-11:111',
      listingStartDate: '2026-07-10',
      listingEndDate: '2026-07-11',
      listingAddressRaw: '123 Main St',
      seenAtIso: '2026-05-22T12:00:00.000Z',
    })

    expect(patch).toEqual({
      superseded_sale_id: 'sale-old',
      superseded_at: '2026-05-22T12:00:00.000Z',
      superseded_reason: 'url_reuse_new_event',
      published_sale_id: null,
    })
  })

  it('returns null when keys match and dates are within tolerance', () => {
    const patch = planYstmUrlReuseSupersessionOnDetailRefresh({
      prior: {
        id: 'ing-1',
        sale_instance_key: 'external_page_source:TX|austin|addr:2026-06-01|2026-06-02:111',
        published_sale_id: 'sale-old',
        date_start: '2026-06-01',
        date_end: '2026-06-02',
        status: 'published',
        failure_reasons: [],
        normalized_address: '123 main st',
      },
      nextSaleInstanceKey: 'external_page_source:TX|austin|addr:2026-06-01|2026-06-02:111',
      listingStartDate: '2026-06-02',
      listingEndDate: '2026-06-03',
      listingAddressRaw: '123 Main St',
    })

    expect(patch).toBeNull()
  })
})
