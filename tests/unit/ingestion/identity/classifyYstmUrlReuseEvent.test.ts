import { describe, expect, it } from 'vitest'
import {
  classifyYstmUrlReuseFromListSeed,
  isPriorityYstmUrlReuseRefresh,
  saleInstanceKeysMateriallyDiffer,
} from '@/lib/ingestion/identity/classifyYstmUrlReuseEvent'

const activeExisting = {
  status: 'ready',
  failure_reasons: [] as unknown,
  date_start: '2026-06-01',
  date_end: '2026-06-02',
  normalized_address: '123 main st',
}

describe('classifyYstmUrlReuseFromListSeed', () => {
  it('returns new_event_same_url when dates shift beyond tolerance', () => {
    expect(
      classifyYstmUrlReuseFromListSeed({
        listingStartDate: '2026-07-10',
        listingEndDate: '2026-07-11',
        listingAddressRaw: '123 Main St',
        existing: activeExisting,
      })
    ).toBe('new_event_same_url')
    expect(isPriorityYstmUrlReuseRefresh('new_event_same_url')).toBe(true)
  })

  it('returns same_event_update when dates align within tolerance', () => {
    expect(
      classifyYstmUrlReuseFromListSeed({
        listingStartDate: '2026-06-02',
        listingEndDate: '2026-06-03',
        listingAddressRaw: '123 Main St',
        existing: activeExisting,
      })
    ).toBe('same_event_update')
  })

  it('returns new_event_same_url when expired row sees active listing dates', () => {
    expect(
      classifyYstmUrlReuseFromListSeed({
        listingStartDate: '2026-08-01',
        listingEndDate: '2026-08-02',
        listingAddressRaw: null,
        existing: {
          status: 'expired',
          failure_reasons: ['sale_expired'],
          date_start: '2026-01-01',
          date_end: '2026-01-02',
          normalized_address: null,
        },
      })
    ).toBe('new_event_same_url')
  })
})

describe('saleInstanceKeysMateriallyDiffer', () => {
  it('detects differing keys', () => {
    expect(
      saleInstanceKeysMateriallyDiffer(
        'external_page_source:TX|austin|addr:2026-06-01|2026-06-02:111',
        'external_page_source:TX|austin|addr:2026-07-10|2026-07-11:111'
      )
    ).toBe(true)
  })
})
