import { describe, expect, it } from 'vitest'
import { isPublishingRowStaleReclaimBlockedByPastEndDateValidation } from '@/lib/ingestion/publishClaimStale'

describe('publishClaimStale', () => {
  it('blocks stale reclaim when failure_details is validation past_end_date', () => {
    expect(
      isPublishingRowStaleReclaimBlockedByPastEndDateValidation({
        phase: 'validation',
        reason: 'past_end_date',
        publish_error: 'listing window ended',
      })
    ).toBe(true)
  })

  it('does not block when phase is not validation', () => {
    expect(
      isPublishingRowStaleReclaimBlockedByPastEndDateValidation({
        phase: 'create_sale',
        reason: 'past_end_date',
      })
    ).toBe(false)
  })

  it('does not block ingestion_expired-shaped details without validation phase', () => {
    expect(
      isPublishingRowStaleReclaimBlockedByPastEndDateValidation({
        kind: 'ingestion_expired',
        reason: 'past_end_date',
      })
    ).toBe(false)
  })
})
