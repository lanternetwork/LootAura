import { describe, expect, it } from 'vitest'
import {
  computeConfigCrawlScheduleWeight,
  windowDetailFirstReadyRate,
} from '@/lib/ingestion/acquisition/configCrawlStats'

describe('config crawl detail-first yield (Phase 4)', () => {
  const nowMs = Date.parse('2026-05-17T12:00:00.000Z')

  it('boosts schedule weight when detail-first ready rate is high', () => {
    const stats = {
      city: 'Louisville',
      state: 'KY',
      source_crawl_last_at: '2026-05-17T10:00:00.000Z',
      source_crawl_window_fetched: 80,
      source_crawl_window_skipped: 10,
      source_crawl_window_fresh_inserted: 2,
      source_crawl_window_detail_first_attempted: 40,
      source_crawl_window_detail_first_succeeded: 12,
    }
    expect(windowDetailFirstReadyRate(stats)).toBeCloseTo(0.3, 2)
    const weight = computeConfigCrawlScheduleWeight(stats, nowMs)
    expect(weight).toBeGreaterThanOrEqual(85)
  })

  it('deprioritizes configs with detail-first attempts but near-zero success', () => {
    const stats = {
      city: 'Chicago',
      state: 'IL',
      source_crawl_last_at: '2026-05-17T10:00:00.000Z',
      source_crawl_window_fetched: 200,
      source_crawl_window_skipped: 180,
      source_crawl_window_fresh_inserted: 0,
      source_crawl_window_detail_first_attempted: 50,
      source_crawl_window_detail_first_succeeded: 0,
    }
    const weight = computeConfigCrawlScheduleWeight(stats, nowMs)
    expect(weight).toBeLessThanOrEqual(25)
  })
})
