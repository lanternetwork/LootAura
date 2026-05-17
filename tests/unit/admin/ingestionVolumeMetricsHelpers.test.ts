import { describe, expect, it } from 'vitest'
import {
  aggregateOrchestrationRuns,
  classifyIngestionBottleneck,
  computeCrawlScheduleEstimates,
  computeDuplicateSkipRate,
  responseContainsRawUrl,
  sanitizeStuckRowSample,
  sumLastHourFromSeries,
} from '@/lib/admin/ingestionVolumeMetricsHelpers'

describe('ingestionVolumeMetricsHelpers', () => {
  it('computes duplicate skip rate safely', () => {
    expect(computeDuplicateSkipRate(3, 10)).toBe(0.3)
    expect(computeDuplicateSkipRate(0, 0)).toBeNull()
  })

  it('estimates crawl due/overdue from rotation heuristics', () => {
    const nowMs = Date.parse('2026-05-17T12:00:00.000Z')
    const est = computeCrawlScheduleEstimates({
      crawlableConfigsTotal: 100,
      orchestrationCursor: 40,
      defaultBatchSize: 20,
      minIntervalMinutes: 10,
      lastSuccessfulExternalIngestionAt: '2026-05-17T10:00:00.000Z',
      latestCompletedNote: {
        status: 'completed',
        configsRemaining: 5,
        budgetExit: true,
      },
      nowMs,
    })
    expect(est.configsDueForCrawl).toBeGreaterThan(0)
    expect(est.estimatedFullRotationMinutes).toBe(50)
  })

  it('aggregates orchestration rows into fetch and geocode rollups', () => {
    const nowMs = Date.parse('2026-05-17T12:00:00.000Z')
    const created = '2026-05-17T11:30:00.000Z'
    const agg = aggregateOrchestrationRuns(
      [
        {
          created_at: created,
          mode: 'ingestion',
          duration_ms: 1200,
          batch_size: 25,
          concurrency: 4,
          claimed_count: 10,
          geocode_succeeded_count: 8,
          failed_retriable_count: 1,
          failed_terminal_count: 0,
          publish_attempted_count: 5,
          publish_succeeded_count: 4,
          publish_failed_count: 1,
          publish_skipped_count: 0,
          publish_expired_count: 0,
          rate_429_count: 2,
          notes: {
            external_ingestion: {
              status: 'completed',
              pagesProcessed: 12,
              configsProcessed: 3,
              fetched: 40,
              inserted: 6,
              invalid: 2,
              errors: 1,
              dedupeTelemetrySummary: {
                source_url: 1,
                exact_address_date: 0,
                soft_date_window: 2,
                soft_duplicate_rejected: 0,
                no_match: 10,
                duplicateDecisionTrue: 0,
                duplicateDecisionFalse: 0,
              },
              externalFetchDurationMs: 900,
            },
          },
        },
      ],
      48,
      nowMs
    )
    expect(agg.fetchRollup24h.sourcePagesFetched).toBe(12)
    expect(agg.fetchRollup24h.listingsInserted).toBe(6)
    expect(agg.geocodeRollup24h.succeeded).toBe(8)
    expect(agg.geocodeRollup24h.rate429).toBe(2)
    expect(computeDuplicateSkipRate(agg.fetchRollup24h.duplicateSkips, agg.fetchRollup24h.dedupeDenominator)).toBe(
      0.2308
    )
    const pagesSeries = sumLastHourFromSeries(
      [...agg.fetchHourly.entries()].map(([bucket, count]) => ({ bucket, count })),
      nowMs
    )
    expect(pagesSeries).toBe(12)
  })

  it('classifies geocode bottleneck when backlog age is critical', () => {
    expect(
      classifyIngestionBottleneck({
        needsGeocodeCount: 50,
        readyCount: 2,
        oldestNeedsGeocodeAgeMs: 3 * 60 * 60 * 1000,
        oldestReadyAgeMs: 1000,
        geocodeStaleCriticalMs: 2 * 60 * 60 * 1000,
        publishStaleCriticalMs: 60 * 60 * 1000,
        fetchOverdueCount: 0,
        rate429Last24h: 0,
        geocodeRetryableLast24h: 0,
        fetchBudgetExitLast24h: 0,
      })
    ).toBe('geocode')
  })

  it('sanitizes stuck rows and detects raw URLs in payloads', () => {
    const row = sanitizeStuckRowSample({
      id: 'id-1',
      status: 'needs_geocode',
      city: 'Austin',
      state: 'TX',
      geocode_attempts: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T01:00:00.000Z',
      last_geocode_attempt_at: null,
      source_url: 'https://example.com/listing',
    })
    expect(row).not.toHaveProperty('source_url')
    expect(responseContainsRawUrl({ ok: true, host: 'example.com' })).toBe(false)
    expect(responseContainsRawUrl({ url: 'https://secret.example/x' })).toBe(true)
  })
})
