import { describe, expect, it } from 'vitest'
import { detailFirstOrchestrationFields } from '@/lib/ingestion/acquisition/detailFirstOrchestrationFields'
import {
  mergeDetailFirstFallbackReasonCounts,
  reconcileDetailFirstFallbackReasonCounts,
  summarizeDetailFirstFallbackReasons,
  sumDetailFirstFallbackReasonCounts,
} from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'

describe('summarizeDetailFirstFallbackReasons', () => {
  it('picks top reason and percentage of attempts', () => {
    const summary = summarizeDetailFirstFallbackReasons(
      {
        spatial_lookup_failed: 40,
        address_validation_failed: 10,
        fetch_failed: 2,
      },
      82,
      52
    )
    expect(summary.topFallbackReason).toBe('spatial_lookup_failed')
    expect(summary.topFallbackReasonCount).toBe(40)
    expect(summary.topFallbackReasonPct).toBeCloseTo(40 / 82, 4)
    expect(summary.fallbackReasonAccounted).toBe(52)
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

  it('fills fallback_unclassified when reason sum is below fallback count', () => {
    const summary = summarizeDetailFirstFallbackReasons(
      { spatial_lookup_failed: 2 },
      100,
      114
    )
    expect(summary.fallbackByReason.spatial_lookup_failed).toBe(2)
    expect(summary.fallbackByReason.fallback_unclassified).toBe(112)
    expect(summary.fallbackReasonAccounted).toBe(114)
    expect(sumDetailFirstFallbackReasonCounts(summary.fallbackByReason)).toBe(114)
  })
})

describe('reconcileDetailFirstFallbackReasonCounts', () => {
  it('adds only the missing gap to fallback_unclassified', () => {
    const counts: Record<string, number> = { fetch_failed: 3 }
    reconcileDetailFirstFallbackReasonCounts(counts, 10)
    expect(counts).toEqual({ fetch_failed: 3, fallback_unclassified: 7 })
  })
})

describe('detailFirstOrchestrationFields regression', () => {
  it('accounts every fallback in persisted ByReason (114/114)', () => {
    const fields = detailFirstOrchestrationFields(
      {
        attempted: 117,
        succeeded: 3,
        published: 2,
        fallback: 114,
        fetchFailed: 5,
        rejectedByReason: { spatial_lookup_failed: 7 },
        msToPublishedSamples: [],
        addressValidatedFromDetailPage: 0,
        addressValidatedFromListSeed: 0,
      },
      10
    )
    expect(fields.ystmDetailFirstFallback).toBe(114)
    expect(sumDetailFirstFallbackReasonCounts(fields.ystmDetailFirstFallbackByReason)).toBe(114)
    expect(fields.ystmDetailFirstFallbackByReason.fallback_unclassified).toBe(107)
  })
})
