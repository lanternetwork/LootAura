import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

const NOW = '2026-06-21T18:00:00.000Z'

const EXPIRED_INVALIDATION_FIELDS = {
  ystm_valid_active: false,
  ystm_invalid_reason: 'expired',
  discovery_priority: 'cold',
  false_exclusion_primary_bucket: null,
  false_exclusion_secondary_tags: [],
  false_exclusion_evidence: null,
  false_exclusion_summary: null,
  false_exclusion_traced_at: null,
  updated_at: NOW,
} as const

describe('backfillExpiredListFastObservationInvalidation', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
  })

  it('updates hot/warm failed+expired valid-active rows with invalidation bundle', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ canonical_url: 'https://example.com/a' }, { canonical_url: 'https://example.com/b' }],
      error: null,
    })
    const eqFailureReason = vi.fn(() => ({ select }))
    const eqOutcome = vi.fn(() => ({ eq: eqFailureReason }))
    const inPriority = vi.fn(() => ({ eq: eqOutcome }))
    const eqValidActive = vi.fn(() => ({ in: inPriority }))
    const update = vi.fn(() => ({ eq: eqValidActive }))

    mockFromBase.mockReturnValue({ update })

    const { backfillExpiredListFastObservationInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillExpiredListFastObservationInvalidation'
    )

    const result = await backfillExpiredListFastObservationInvalidation({} as never, NOW)

    expect(result).toEqual({ updated: 2 })
    expect(update).toHaveBeenCalledWith(EXPIRED_INVALIDATION_FIELDS)
    expect(eqValidActive).toHaveBeenCalledWith('ystm_valid_active', true)
    expect(inPriority).toHaveBeenCalledWith('discovery_priority', ['hot', 'warm'])
    expect(eqOutcome).toHaveBeenCalledWith('missing_ingestion_outcome', 'failed')
    expect(eqFailureReason).toHaveBeenCalledWith('missing_ingestion_failure_reason', 'expired')
  })

  it('returns zero when no rows match', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null })
    const eqFailureReason = vi.fn(() => ({ select }))
    const eqOutcome = vi.fn(() => ({ eq: eqFailureReason }))
    const inPriority = vi.fn(() => ({ eq: eqOutcome }))
    const eqValidActive = vi.fn(() => ({ in: inPriority }))
    const update = vi.fn(() => ({ eq: eqValidActive }))

    mockFromBase.mockReturnValue({ update })

    const { backfillExpiredListFastObservationInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillExpiredListFastObservationInvalidation'
    )

    const result = await backfillExpiredListFastObservationInvalidation({} as never, NOW)
    expect(result).toEqual({ updated: 0 })
  })

  it('throws on DB error', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } })
    const eqFailureReason = vi.fn(() => ({ select }))
    const eqOutcome = vi.fn(() => ({ eq: eqFailureReason }))
    const inPriority = vi.fn(() => ({ eq: eqOutcome }))
    const eqValidActive = vi.fn(() => ({ in: inPriority }))
    const update = vi.fn(() => ({ eq: eqValidActive }))

    mockFromBase.mockReturnValue({ update })

    const { backfillExpiredListFastObservationInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillExpiredListFastObservationInvalidation'
    )

    await expect(backfillExpiredListFastObservationInvalidation({} as never, NOW)).rejects.toThrow(
      'timeout'
    )
  })
})
