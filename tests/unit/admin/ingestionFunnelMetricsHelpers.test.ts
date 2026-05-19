import { describe, expect, it } from 'vitest'
import {
  aggregateCohortFunnel,
  buildIngestionFunnelMetrics,
  partitionCohortRow,
  rollupExternalIngestionForWindow,
} from '@/lib/admin/ingestionFunnelMetricsHelpers'
import type { OrchestrationRunRow } from '@/lib/admin/ingestionVolumeMetricsHelpers'

const NOW = Date.parse('2026-05-17T12:00:00.000Z')

function orchRow(created: string, note: Record<string, unknown>): OrchestrationRunRow {
  return {
    created_at: created,
    mode: 'ingestion',
    duration_ms: 1000,
    batch_size: 25,
    concurrency: 4,
    claimed_count: 0,
    geocode_succeeded_count: 0,
    failed_retriable_count: 0,
    failed_terminal_count: 0,
    publish_attempted_count: 0,
    publish_succeeded_count: 0,
    publish_failed_count: 0,
    publish_skipped_count: 0,
    rate_429_count: 0,
    notes: { external_ingestion: note },
  }
}

describe('ingestionFunnelMetricsHelpers', () => {
  it('reconciles crawler discovered with inserted + skipped + invalid', () => {
    const created = '2026-05-17T11:00:00.000Z'
    const rollup = rollupExternalIngestionForWindow(
      [
        orchRow(created, {
          status: 'completed',
          fetched: 100,
          inserted: 12,
          skipped: 80,
          invalid: 8,
        }),
      ],
      24,
      NOW
    )
    expect(rollup.listingsDiscovered).toBe(100)
    expect(rollup.listingsInserted + rollup.listingsSkipped + rollup.parserInvalid).toBe(100)

    const funnel = buildIngestionFunnelMetrics({
      orchestrationRows: [
        orchRow(created, {
          status: 'completed',
          fetched: 100,
          inserted: 12,
          skipped: 80,
          invalid: 8,
          dedupeTelemetrySummary: {
            source_url: 5,
            exact_address_date: 2,
            soft_date_window: 3,
            soft_duplicate_rejected: 0,
            no_match: 10,
            duplicateDecisionTrue: 0,
            duplicateDecisionFalse: 0,
          },
        }),
      ],
      cohortRows: [],
      nowMs: NOW,
    })

    expect(funnel['24h'].reconciliation.crawlerReconciles).toBe(true)
    expect(funnel['24h'].duplicateHits.duplicate_cross_city_page).toBe(0)
  })

  it('partitions cohort rows to sum inserted', () => {
    const created = '2026-05-17T10:00:00.000Z'
    const cohort = aggregateCohortFunnel(
      [
        {
          created_at: created,
          source_platform: 'external_page_source',
          canonical_source_url: 'https://example.com/a',
          source_url: 'https://yardsaletreasuremap.com/x/listing.html?id=1',
          status: 'published',
          address_status: 'address_available',
          geocode_method: 'ystm_provider_native',
          lat: 38.2,
          lng: -85.7,
          native_coord_failure_reason: null,
          native_coord_attempts: 1,
          failure_reasons: [],
          published_at: '2026-05-17T11:30:00.000Z',
          is_duplicate: false,
        },
        {
          created_at: created,
          source_platform: 'external_page_source',
          canonical_source_url: 'https://example.com/b',
          source_url: 'https://yardsaletreasuremap.com/x/listing.html?id=2',
          status: 'needs_geocode',
          address_status: 'address_gated',
          geocode_method: null,
          lat: null,
          lng: null,
          native_coord_failure_reason: null,
          native_coord_attempts: 0,
          failure_reasons: [],
          published_at: null,
          is_duplicate: false,
        },
        {
          created_at: created,
          source_platform: 'manual',
          canonical_source_url: 'https://example.com/c',
          source_url: 'https://example.com/c',
          status: 'expired',
          address_status: 'address_available',
          geocode_method: 'nominatim_locality',
          lat: 1,
          lng: 2,
          native_coord_failure_reason: null,
          native_coord_attempts: 0,
          failure_reasons: ['sale_expired'],
          published_at: null,
          is_duplicate: false,
        },
      ],
      24,
      NOW
    )

    expect(cohort.inserted).toBe(3)
    expect(cohort.uniqueCanonicalUrls).toBe(3)
    const sum = Object.values(cohort.partition).reduce((a, b) => a + b, 0)
    expect(sum).toBe(3)
    expect(partitionCohortRow({
      created_at: created,
      source_platform: 'external_page_source',
      canonical_source_url: 'x',
      source_url: 'https://yardsaletreasuremap.com/x/listing.html',
      status: 'needs_check',
      address_status: 'address_available',
      geocode_method: null,
      lat: null,
      lng: null,
      native_coord_failure_reason: 'terminal_no_coords',
      native_coord_attempts: 5,
      failure_reasons: ['geocode_failed'],
      published_at: null,
      is_duplicate: false,
    })).toBe('native_coord_failed')
  })

  it('rolls up YSTM detail-first counters from external ingestion notes', () => {
    const created = '2026-05-17T11:00:00.000Z'
    const rollup = rollupExternalIngestionForWindow(
      [
        orchRow(created, {
          status: 'completed',
          fetched: 10,
          inserted: 2,
          skipped: 8,
          freshInserted: 2,
          ystmDetailFirstAttempted: 5,
          ystmDetailFirstSucceeded: 2,
          ystmDetailFirstPublished: 1,
          ystmDetailFirstFallback: 3,
          ystmDetailFirstFetchFailed: 1,
          ystmDetailFirstFallbackByReason: {
            spatial_lookup_failed: 2,
            address_validation_failed: 1,
          },
          detailFirstAddressFromDetailPage: 3,
          detailFirstAddressFromListSeed: 1,
          medianMsToPublished: 420,
        }),
      ],
      24,
      NOW
    )
    expect(rollup.detailFirstAttempted).toBe(5)
    expect(rollup.detailFirstAddressFromDetailPage).toBe(3)
    expect(rollup.detailFirstAddressFromListSeed).toBe(1)
    expect(rollup.detailFirstFallbackByReason).toEqual({
      spatial_lookup_failed: 2,
      address_validation_failed: 1,
    })
    expect(rollup.detailFirstSucceeded).toBe(2)
    expect(rollup.detailFirstPublished).toBe(1)
    expect(rollup.detailFirstFallback).toBe(3)
    expect(rollup.detailFirstFetchFailed).toBe(1)
    expect(rollup.detailFirstMsToPublishedSamples).toEqual([420])

    const funnel = buildIngestionFunnelMetrics({
      orchestrationRows: [
        orchRow(created, {
          status: 'completed',
          fetched: 10,
          inserted: 2,
          skipped: 8,
          freshInserted: 2,
          ystmDetailFirstAttempted: 5,
          ystmDetailFirstSucceeded: 2,
          ystmDetailFirstPublished: 1,
          ystmDetailFirstFallback: 3,
          ystmDetailFirstFetchFailed: 1,
          ystmDetailFirstFallbackByReason: {
            spatial_lookup_failed: 2,
            address_validation_failed: 1,
          },
          detailFirstAddressFromDetailPage: 3,
          detailFirstAddressFromListSeed: 1,
          medianMsToPublished: 420,
        }),
      ],
      cohortRows: [],
      nowMs: NOW,
    })
    expect(funnel['24h'].detailFirst.attempted).toBe(5)
    expect(funnel['24h'].detailFirst.addressFromDetailPage).toBe(3)
    expect(funnel['24h'].detailFirst.addressFromListSeed).toBe(1)
    expect(funnel['24h'].detailFirst.addressFromDetailPageRate).toBe(0.6)
    expect(funnel['24h'].detailFirst.providerGeocodeBypassRate).toBe(0.4)
    expect(funnel['24h'].detailFirst.topFallbackReason).toBe('spatial_lookup_failed')
    expect(funnel['24h'].detailFirst.topFallbackReasonPct).toBe(0.4)
    expect(funnel['24h'].detailFirst.fallbackByReason).toEqual({
      spatial_lookup_failed: 2,
      address_validation_failed: 1,
    })
    expect(funnel['24h'].detailFirst.fallbackReasonAccounted).toBe(3)
    expect(funnel['24h'].detailFirst.fallbackUnclassified).toBe(0)
    expect(funnel['24h'].detailFirst.operationalHealth.healthy).toBe(true)
    expect(funnel['24h'].detailFirst.operationalHealth.alerts).toHaveLength(0)
  })

  it('reconciles legacy fallback totals with sparse ByReason into fallback_unclassified', () => {
    const created = '2026-05-17T11:00:00.000Z'
    const funnel = buildIngestionFunnelMetrics({
      orchestrationRows: [
        orchRow(created, {
          status: 'completed',
          fetched: 10,
          inserted: 2,
          skipped: 8,
          freshInserted: 2,
          ystmDetailFirstAttempted: 117,
          ystmDetailFirstSucceeded: 3,
          ystmDetailFirstPublished: 2,
          ystmDetailFirstFallback: 114,
          ystmDetailFirstFetchFailed: 5,
          ystmDetailFirstFallbackByReason: { spatial_lookup_failed: 7 },
        }),
      ],
      cohortRows: [],
      nowMs: NOW,
    })
    expect(funnel['24h'].detailFirst.fallback).toBe(114)
    expect(funnel['24h'].detailFirst.fallbackReasonAccounted).toBe(114)
    expect(funnel['24h'].detailFirst.fallbackUnclassified).toBe(107)
    expect(funnel['24h'].detailFirst.fallbackByReason.spatial_lookup_failed).toBe(7)
    expect(funnel['24h'].detailFirst.fallbackByReason.fallback_unclassified).toBe(107)
  })
})
