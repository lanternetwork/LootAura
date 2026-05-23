import { describe, expect, it, vi } from 'vitest'
import { persistSaleInstanceShadowReplays } from '@/lib/ingestion/ystmCoverage/persistSaleInstanceShadowReplay'

const mockUpsert = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: vi.fn(() => ({
    upsert: mockUpsert,
  })),
}))

describe('persistSaleInstanceShadowReplays', () => {
  it('upserts divergence_kind for shadow replay rows', async () => {
    mockUpsert.mockResolvedValue({ error: null })

    await persistSaleInstanceShadowReplays({} as never, [
      {
        canonicalUrl: 'https://yardsaletreasuremap.com/us/il/chicago/1/listing.html',
        state: 'IL',
        city: 'Chicago',
        replayedAt: '2026-05-22T12:00:00.000Z',
        ingestedSaleId: 'ing-1',
        comparison: {
          oldDecision: 'duplicate_url_skip',
          newDecision: 'new_event_same_url',
          oldWouldSuppress: true,
          newWouldSuppress: false,
          wouldPublish: true,
          wouldCreateNewInstance: true,
          confidence: 'high',
          reasonCodes: ['url_reuse'],
          oldSkipSubReason: 'url_match_dates_changed',
          divergenceKind: 'old_suppress_new_publish',
          matchedIngestedSaleId: 'ing-1',
          saleInstanceKey: 'key-1',
        },
      },
    ])

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          canonical_url: 'https://yardsaletreasuremap.com/us/il/chicago/1/listing.html',
          divergence_kind: 'old_suppress_new_publish',
          would_publish: true,
        }),
      ]),
      { onConflict: 'canonical_url' }
    )
  })
})
