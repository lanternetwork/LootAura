import { describe, expect, it } from 'vitest'
import { buildYieldAwareCrawlPlan } from '@/lib/ingestion/acquisition/yieldAwareCrawlSchedule'

const now = Date.parse('2026-05-17T12:00:00.000Z')

describe('buildYieldAwareCrawlPlan', () => {
  it('places high-yield config before saturated when both share domain', () => {
    const rows = [
      {
        city: 'Saturated',
        state: 'KY',
        source_platform: 'external_page_source',
        source_pages: ['https://yardsaletreasuremap.com/city/sat'],
        source_crawl_window_fetched: 10,
        source_crawl_window_skipped: 90,
        source_crawl_last_at: '2026-05-17T11:00:00.000Z',
      },
      {
        city: 'Fresh',
        state: 'KY',
        source_platform: 'external_page_source',
        source_pages: ['https://yardsaletreasuremap.com/city/fresh'],
        source_crawl_last_insert_at: '2026-05-17T10:00:00.000Z',
        source_crawl_window_inserted: 3,
        source_crawl_window_fetched: 20,
        source_crawl_window_skipped: 2,
        source_crawl_last_at: '2026-05-17T11:30:00.000Z',
      },
    ]

    const plan = buildYieldAwareCrawlPlan(rows, now)
    const freshIdx = plan.findIndex((r) => r.city === 'Fresh')
    const satIdx = plan.findIndex((r) => r.city === 'Saturated')
    expect(freshIdx).toBeGreaterThanOrEqual(0)
    expect(satIdx).toBeGreaterThanOrEqual(0)
    expect(freshIdx).toBeLessThan(satIdx)
  })
})
