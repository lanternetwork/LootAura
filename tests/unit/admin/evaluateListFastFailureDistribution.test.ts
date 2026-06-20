import { describe, expect, it } from 'vitest'
import {
  classifyListFastSnapshotCompleteness,
  parseListMetadataSnapshotForAudit,
} from '@/lib/admin/classifyListFastSnapshotForAudit'
import { evaluateListFastFailureDistribution } from '@/lib/admin/evaluateListFastFailureDistribution'
import type { ListFastFailureDistributionAnalysis } from '@/lib/admin/listFastFailureDistributionTypes'

function emptyAnalysis(
  overrides: Partial<ListFastFailureDistributionAnalysis> = {}
): ListFastFailureDistributionAnalysis {
  return {
    generatedAt: '2026-06-20T12:00:00.000Z',
    cohortWindowHours: 24,
    totalFailedHot24h: 0,
    totalFailedHotWarm24h: 0,
    totalIngestedHot24h: 0,
    hotQueueDepth: 0,
    oldestFailedAgeHours: null,
    newestFailedAgeHours: null,
    byFailureReason: {},
    bySnapshotCompleteness: {
      complete_snapshot: 0,
      missing_snapshot: 0,
      missing_dates: 0,
      missing_title: 0,
      missing_address_and_coords: 0,
      missing_coords_only: 0,
      validity_rejected_other: 0,
    },
    byPublishSuppression: {
      existing_published_sale_linked: 0,
      sale_instance_key_collision: 0,
      archived_at_not_null: 0,
      ends_at_past: 0,
      moderation_hidden: 0,
      published_but_observation_stale: 0,
    },
    byGeocodeImpact: {
      native_coords_in_snapshot: 0,
      geocode_unavailable_failure: 0,
      validity_gated_before_geocode: 0,
      insert_failed_after_geocode: 0,
      other_failure_path: 0,
    },
    ingestedByStatus: {},
    ingestedNeedsGeocodeCount: 0,
    ingestedPublishFailedCount: 0,
    ...overrides,
  }
}

describe('classifyListFastSnapshotForAudit', () => {
  it('parses snapshot JSON and classifies gated_only as missing_address_and_coords', () => {
    const snapshot = parseListMetadataSnapshotForAudit(
      {
        sourceUrl: 'https://yardsaletreasuremap.com/US/MA/Boston/x/1/userlisting.html',
        title: 'Garage sale',
        startDate: '2026-06-21',
        endDate: '2026-06-22',
      },
      'https://yardsaletreasuremap.com/US/MA/Boston/x/1/userlisting.html'
    )
    expect(snapshot?.title).toBe('Garage sale')
    expect(classifyListFastSnapshotCompleteness(snapshot)).toBe('missing_address_and_coords')
  })

  it('classifies valid snapshot with coords as complete_snapshot', () => {
    const snapshot = parseListMetadataSnapshotForAudit(
      {
        sourceUrl: 'https://yardsaletreasuremap.com/US/MA/Boston/x/2/userlisting.html',
        title: 'Moving sale',
        startDate: '2026-06-21',
        endDate: '2026-06-22',
        lat: 42.36,
        lng: -71.05,
      },
      'https://yardsaletreasuremap.com/US/MA/Boston/x/2/userlisting.html'
    )
    expect(classifyListFastSnapshotCompleteness(snapshot)).toBe('complete_snapshot')
  })
})

describe('evaluateListFastFailureDistribution', () => {
  it('classifies geocode_unavailable dominance as GEOCODE_BLOCKED', () => {
    const discovery = evaluateListFastFailureDistribution(
      emptyAnalysis({
        totalFailedHot24h: 60,
        hotQueueDepth: 60,
        byFailureReason: {
          geocode_unavailable: 55,
          insert_failed: 5,
        },
        byGeocodeImpact: {
          native_coords_in_snapshot: 0,
          geocode_unavailable_failure: 55,
          validity_gated_before_geocode: 0,
          insert_failed_after_geocode: 5,
          other_failure_path: 0,
        },
      })
    )

    expect(discovery.dominantFailureReason).toBe('geocode_unavailable')
    expect(discovery.dominantFailureReasonOver70).toBe(true)
    expect(discovery.f1Classification).toBe('GEOCODE_BLOCKED')
    expect(discovery.recommendedRepairSpec).toBe('LIST_FAST_GEOCODE_UNAVAILABLE_REPAIR_V1')
    expect(discovery.auditComplete).toBe(true)
  })

  it('prioritizes publish gap when ingested cohort dominates failures', () => {
    const discovery = evaluateListFastFailureDistribution(
      emptyAnalysis({
        totalFailedHot24h: 20,
        totalIngestedHot24h: 40,
        byFailureReason: {
          geocode_unavailable: 12,
          gated_only: 8,
        },
        ingestedByStatus: {
          needs_check: 30,
          ready: 10,
        },
      })
    )

    expect(discovery.f2Classification).toBe('INGESTED_NEEDS_CHECK')
    expect(discovery.recommendedRepairSpec).toContain('LIST_FAST_INGESTED_NEEDS_CHECK_REPAIR_V1')
  })
})
