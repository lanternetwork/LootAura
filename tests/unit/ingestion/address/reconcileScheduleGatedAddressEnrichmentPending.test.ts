import { describe, expect, it } from 'vitest'
import { shouldReclassifyScheduleGatedAddressEnrichmentPending } from '@/lib/ingestion/address/reconcileScheduleGatedAddressEnrichmentPending'

const nowMs = Date.parse('2026-06-17T12:00:00.000Z')

describe('shouldReclassifyScheduleGatedAddressEnrichmentPending', () => {
  it('reclassifies pending rows blocked by future unlock schedule', () => {
    expect(
      shouldReclassifyScheduleGatedAddressEnrichmentPending(
        {
          address_status: 'address_enrichment_pending',
          address_enrichment_attempts: 0,
          next_enrichment_attempt_at: '2026-12-01T06:00:10.000Z',
          address_unlock_at: '2026-12-01T06:00:00.000Z',
          last_address_enrichment_attempt_at: null,
        },
        nowMs
      )
    ).toBe(true)
  })

  it('does not reclassify claimable pending rows', () => {
    expect(
      shouldReclassifyScheduleGatedAddressEnrichmentPending(
        {
          address_status: 'address_enrichment_pending',
          address_enrichment_attempts: 0,
          next_enrichment_attempt_at: null,
          address_unlock_at: null,
          last_address_enrichment_attempt_at: null,
        },
        nowMs
      )
    ).toBe(false)
  })

  it('does not reclassify retry or terminal statuses', () => {
    expect(
      shouldReclassifyScheduleGatedAddressEnrichmentPending(
        {
          address_status: 'address_enrichment_retry',
          address_enrichment_attempts: 2,
          next_enrichment_attempt_at: '2026-12-01T06:00:00.000Z',
          address_unlock_at: '2026-12-01T06:00:00.000Z',
          last_address_enrichment_attempt_at: null,
        },
        nowMs
      )
    ).toBe(false)
  })
})
