import { describe, expect, it } from 'vitest'
import { computeConfigCrawlScheduleWeight } from '@/lib/ingestion/acquisition/configCrawlStats'

describe('computeConfigCrawlScheduleWeight (Phase 3A)', () => {
  const nowMs = Date.parse('2026-05-17T12:00:00.000Z')

  it('deprioritizes high expired-discovery configs', () => {
    const stale = computeConfigCrawlScheduleWeight(
      {
        city: 'A',
        state: 'KY',
        source_crawl_last_at: '2026-05-17T10:00:00.000Z',
        source_crawl_window_fetched: 100,
        source_crawl_window_skipped_expired: 50,
        source_crawl_window_fresh_inserted: 0,
      },
      nowMs
    )
    const fresh = computeConfigCrawlScheduleWeight(
      {
        city: 'B',
        state: 'KY',
        source_crawl_last_at: '2026-05-17T10:00:00.000Z',
        source_crawl_window_fetched: 100,
        source_crawl_window_skipped_expired: 2,
        source_crawl_window_fresh_inserted: 8,
      },
      nowMs
    )
    expect(stale).toBeLessThan(fresh)
  })
})
