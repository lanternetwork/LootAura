import { describe, expect, it } from 'vitest'
import { partitionCrawlableExternalCityConfigs } from '@/lib/ingestion/partitionCrawlableExternalConfigs'

describe('partitionCrawlableExternalCityConfigs', () => {
  it('includes configs with at least one HTTPS source page', () => {
    const result = partitionCrawlableExternalCityConfigs([
      {
        city: 'Oak Lawn',
        state: 'IL',
        source_platform: 'external_page_source',
        source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Oak-Lawn.html'],
      },
    ])
    expect(result.configsCrawlable).toBe(1)
    expect(result.crawlable).toHaveLength(1)
    expect(result.configsSkippedNoSourcePages).toBe(0)
    expect(result.configsSkippedInvalidUrls).toBe(0)
  })

  it('excludes enabled configs with empty source_pages', () => {
    const result = partitionCrawlableExternalCityConfigs([
      {
        city: 'Birmingham',
        state: 'AL',
        source_platform: 'external_page_source',
        source_pages: [],
      },
    ])
    expect(result.configsCrawlable).toBe(0)
    expect(result.crawlable).toHaveLength(0)
    expect(result.configsSkippedNoSourcePages).toBe(1)
    expect(result.configsSkippedInvalidUrls).toBe(0)
  })

  it('counts non-HTTPS-only source_pages as invalid URLs', () => {
    const result = partitionCrawlableExternalCityConfigs([
      {
        city: 'Bad',
        state: 'CA',
        source_platform: 'external_page_source',
        source_pages: ['http://insecure.example/page.html', 'ftp://bad.example/x'],
      },
    ])
    expect(result.configsCrawlable).toBe(0)
    expect(result.configsSkippedNoSourcePages).toBe(0)
    expect(result.configsSkippedInvalidUrls).toBe(1)
  })

  it('ignores non-external_page_source rows', () => {
    const result = partitionCrawlableExternalCityConfigs([
      {
        city: 'X',
        state: 'IL',
        source_platform: 'other_platform',
        source_pages: ['https://example.com/page.html'],
      },
    ])
    expect(result.configsCrawlable).toBe(0)
    expect(result.configsSkippedNoSourcePages).toBe(0)
    expect(result.configsSkippedInvalidUrls).toBe(0)
  })

  it('partitions mixed crawlable and placeholder configs', () => {
    const result = partitionCrawlableExternalCityConfigs([
      {
        city: 'Empty',
        state: 'AL',
        source_platform: 'external_page_source',
        source_pages: [],
      },
      {
        city: 'HttpOnly',
        state: 'AL',
        source_platform: 'external_page_source',
        source_pages: ['http://only-http.example/x.html'],
      },
      {
        city: 'Good',
        state: 'IL',
        source_platform: 'external_page_source',
        source_pages: ['https://good.example/list.html'],
      },
    ])
    expect(result.configsCrawlable).toBe(1)
    expect(result.crawlable.map((r) => r.city)).toEqual(['Good'])
    expect(result.configsSkippedNoSourcePages).toBe(1)
    expect(result.configsSkippedInvalidUrls).toBe(1)
  })
})
