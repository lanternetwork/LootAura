import { describe, expect, it } from 'vitest'
import {
  classifySaleInstance,
  isPrioritySaleInstanceDecision,
} from '@/lib/ingestion/identity/classifySaleInstance'
import { computeYstmSaleInstanceIdentity } from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'

const LISTING_URL =
  'https://yardsaletreasuremap.com/US/Texas/Austin/Austin.html/961002738/listing.html'

describe('classifySaleInstance', () => {
  it('returns invalid_event for non-YSTM URLs', () => {
    const result = classifySaleInstance({
      sourcePlatform: 'external_page_source',
      sourceUrl: 'https://example.com/listing',
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 main',
      dateStart: '2026-06-01',
      dateEnd: '2026-06-02',
      existingRowsBySourceUrl: [],
      existingRowsBySaleInstanceKey: [],
      existingRowsByAddressDate: [],
    })
    expect(result.decision).toBe('invalid_event')
  })

  it('prefers sale_instance_key match over URL-only history', () => {
    const identity = computeYstmSaleInstanceIdentity({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 Main St',
      dateStart: '2026-06-02',
      dateEnd: '2026-06-03',
      title: 'Garage Sale',
      description: 'Stuff',
    })!
    const key = identity.sale_instance_key!
    const contentHash = identity.source_content_hash!

    const result = classifySaleInstance({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 Main St',
      dateStart: '2026-06-02',
      dateEnd: '2026-06-03',
      title: 'Garage Sale',
      description: 'Stuff',
      existingRowsBySourceUrl: [
        {
          id: 'by-url',
          sale_instance_key: key,
          source_content_hash: contentHash,
          date_start: '2026-06-02',
          date_end: '2026-06-03',
          normalized_address: '123 main st',
          status: 'ready',
          failure_reasons: [],
        },
      ],
      existingRowsBySaleInstanceKey: [
        {
          id: 'by-key',
          sale_instance_key: key,
          source_content_hash: contentHash,
          date_start: '2026-06-02',
          date_end: '2026-06-03',
          status: 'ready',
          failure_reasons: [],
        },
      ],
      existingRowsByAddressDate: [],
    })

    expect(result.decision).toBe('same_event_no_change')
    expect(result.matchedIngestedSaleId).toBe('by-key')
    expect(result.reasons).toContain('sale_instance_key_match')
  })

  it('returns new_event_same_url when keys differ at same URL', () => {
    const result = classifySaleInstance({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 Main St',
      dateStart: '2026-08-01',
      dateEnd: '2026-08-02',
      title: 'New sale',
      description: 'New',
      existingRowsBySourceUrl: [
        {
          id: 'ing-1',
          sale_instance_key:
            'external_page_source:TX|austin|123 main st:2026-06-01|2026-06-02:961002738',
          date_start: '2026-06-01',
          date_end: '2026-06-02',
          normalized_address: '123 main st',
          status: 'published',
          failure_reasons: [],
        },
      ],
      existingRowsBySaleInstanceKey: [],
      existingRowsByAddressDate: [],
    })

    expect(result.decision).toBe('new_event_same_url')
    expect(isPrioritySaleInstanceDecision(result.decision)).toBe(true)
    expect(result.supersedesIngestedSaleId).toBe('ing-1')
  })

  it('returns same_event_updated when content hash changes for same instance key', () => {
    const identity = computeYstmSaleInstanceIdentity({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 Main St',
      dateStart: '2026-06-02',
      dateEnd: '2026-06-03',
      title: 'Updated title',
      description: 'New stuff',
    })!
    const key = identity.sale_instance_key!

    const result = classifySaleInstance({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 Main St',
      dateStart: '2026-06-02',
      dateEnd: '2026-06-03',
      title: 'Updated title',
      description: 'New stuff',
      existingRowsBySourceUrl: [],
      existingRowsBySaleInstanceKey: [
        {
          id: 'ing-1',
          sale_instance_key: key,
          source_content_hash: 'oldhash000000000000000000000000000000000000000000000000000000',
          date_start: '2026-06-02',
          date_end: '2026-06-03',
          status: 'ready',
          failure_reasons: [],
        },
      ],
      existingRowsByAddressDate: [],
    })

    expect(result.decision).toBe('same_event_updated')
    expect(result.matchedIngestedSaleId).toBe('ing-1')
  })

  it('returns ambiguous_requires_review when URL history lacks match signals', () => {
    const result = classifySaleInstance({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 Main St',
      dateStart: null,
      dateEnd: null,
      existingRowsBySourceUrl: [
        {
          id: 'ing-1',
          sale_instance_key: null,
          date_start: null,
          date_end: null,
          normalized_address: '999 other st',
          status: 'ready',
          failure_reasons: [],
        },
      ],
      existingRowsBySaleInstanceKey: [],
      existingRowsByAddressDate: [],
    })

    expect(result.decision).toBe('ambiguous_requires_review')
  })
})
