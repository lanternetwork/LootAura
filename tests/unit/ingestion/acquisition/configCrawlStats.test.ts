import { describe, expect, it } from 'vitest'
import {
  computeConfigCrawlScheduleWeight,
  isConfigCrawlSaturated,
  rollCrawlStatsWindow,
  windowSkipRatio,
} from '@/lib/ingestion/acquisition/configCrawlStats'

const now = Date.parse('2026-05-17T12:00:00.000Z')

describe('configCrawlStats', () => {
  it('detects saturation from window skip ratio', () => {
    const stats = {
      city: 'A',
      state: 'KY',
      source_crawl_window_fetched: 5,
      source_crawl_window_skipped: 95,
      source_crawl_last_at: '2026-05-17T11:00:00.000Z',
    }
    expect(windowSkipRatio(stats)).toBeGreaterThan(0.9)
    expect(isConfigCrawlSaturated(stats, now)).toBe(true)
    expect(computeConfigCrawlScheduleWeight(stats, now)).toBeLessThanOrEqual(25)
  })

  it('boosts never-crawled configs', () => {
    expect(
      computeConfigCrawlScheduleWeight(
        { city: 'B', state: 'KY', source_crawl_last_at: null },
        now
      )
    ).toBeGreaterThanOrEqual(70)
  })

  it('resets expired rolling window', () => {
    const rolled = rollCrawlStatsWindow(
      {
        city: 'C',
        state: 'KY',
        source_crawl_window_started_at: '2026-05-01T00:00:00.000Z',
        source_crawl_window_fetched: 100,
      },
      now
    )
    expect(rolled.windowFetched).toBe(0)
    expect(rolled.windowSkipped).toBe(0)
  })
})
