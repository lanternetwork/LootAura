import { describe, expect, it } from 'vitest'
import { computeYstmSaleInstanceIdentity } from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import {
  isYstmSaleInstanceClassifierEnforcementEnabled,
  resolveYstmEnforcedExistingUrlCrawlAction,
} from '@/lib/ingestion/identity/ystmSaleInstanceClassifierEnforcement'

const LISTING_URL =
  'https://yardsaletreasuremap.com/US/Texas/Austin/Austin.html/961002738/listing.html'

describe('ystmSaleInstanceClassifierEnforcement', () => {
  it('is disabled unless env is true', () => {
    expect(isYstmSaleInstanceClassifierEnforcementEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(
      isYstmSaleInstanceClassifierEnforcementEnabled({
        INGESTION_YSTM_SALE_INSTANCE_CLASSIFIER_ENFORCE: 'true',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(true)
  })

  it('queues detail-first for new_event_same_url at a reused URL', () => {
    const { action, classification } = resolveYstmEnforcedExistingUrlCrawlAction({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 main st',
      dateStart: '2026-08-01',
      dateEnd: '2026-08-02',
      addressRaw: '123 Main St',
      existing: {
        id: 'ing-1',
        sale_instance_key:
          'external_page_source:TX|austin|123 main st:2026-06-01|2026-06-02:961002738',
        date_start: '2026-06-01',
        date_end: '2026-06-02',
        normalized_address: '123 main st',
        status: 'published',
        failure_reasons: [],
      },
      existingUrlCandidates: [
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
    })

    expect(classification.decision).toBe('new_event_same_url')
    expect(action.kind).toBe('queue_detail_first')
    if (action.kind === 'queue_detail_first') {
      expect(action.priority).toBe(true)
      expect(action.existingIngestedSaleId).toBe('ing-1')
    }
  })

  it('duplicate-skips benign same_event_no_change', () => {
    const identity = computeYstmSaleInstanceIdentity({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 main st',
      dateStart: '2026-06-02',
      dateEnd: '2026-06-03',
      title: 'Garage Sale',
      description: 'Stuff',
    })!
    const key = identity.sale_instance_key!
    const hash = identity.source_content_hash!

    const { action } = resolveYstmEnforcedExistingUrlCrawlAction({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 main st',
      dateStart: '2026-06-02',
      dateEnd: '2026-06-03',
      addressRaw: '123 Main St',
      title: 'Garage Sale',
      description: 'Stuff',
      existing: {
        id: 'ing-1',
        sale_instance_key: key,
        source_content_hash: hash,
        date_start: '2026-06-02',
        date_end: '2026-06-03',
        normalized_address: '123 main st',
        status: 'ready',
        failure_reasons: [],
      },
      existingUrlCandidates: [
        {
          id: 'ing-1',
          sale_instance_key: key,
          source_content_hash: hash,
          date_start: '2026-06-02',
          date_end: '2026-06-03',
          normalized_address: '123 main st',
          status: 'ready',
          failure_reasons: [],
        },
      ],
    })

    expect(action.kind).toBe('duplicate_skip')
  })
})
