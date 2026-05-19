import { describe, expect, it } from 'vitest'
import {
  mergeDetailFirstFallbackReasonCounts,
  summarizeDetailFirstFallbackReasons,
} from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'

describe('summarizeDetailFirstFallbackReasons', () => {
  it('picks top reason and percentage of attempts', () => {
    const summary = summarizeDetailFirstFallbackReasons(
      {
        spatial_lookup_failed: 40,
        address_validation_failed: 10,
        fetch_failed: 2,
      },
      82
    )
    expect(summary.topFallbackReason).toBe('spatial_lookup_failed')
    expect(summary.topFallbackReasonCount).toBe(40)
    expect(summary.topFallbackReasonPct).toBeCloseTo(40 / 82, 4)
    expect(summary.fallbackByReason.spatial_lookup_failed).toBe(40)
  })

  it('merges counts across orchestration rows', () => {
    const merged: Record<string, number> = {}
    mergeDetailFirstFallbackReasonCounts(merged, { spatial_lookup_failed: 3 })
    mergeDetailFirstFallbackReasonCounts(merged, {
      spatial_lookup_failed: 2,
      gated_address: 1,
    })
    expect(merged).toEqual({
      spatial_lookup_failed: 5,
      gated_address: 1,
    })
  })
})
