import { describe, expect, it } from 'vitest'
import {
  isCrawlExcludedDiscoveryRow,
  shouldExcludePlaceholderFromCrawl,
} from '@/lib/ingestion/discovery/discoveryPlaceholderPolicy'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'

describe('discoveryPlaceholderPolicy', () => {
  it('excludes placeholders from crawl after threshold', () => {
    expect(shouldExcludePlaceholderFromCrawl('placeholder_unresolved', 1, 1)).toBe(true)
    expect(shouldExcludePlaceholderFromCrawl('placeholder_unresolved', 1, 2)).toBe(false)
  })

  it('detects crawl-excluded rows', () => {
    expect(
      isCrawlExcludedDiscoveryRow({
        source_discovery_status: SOURCE_DISCOVERY_STATUS.failed,
        source_pages: [],
        source_crawl_excluded_at: '2026-05-16T00:00:00.000Z',
      })
    ).toBe(true)
  })
})
