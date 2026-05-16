import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'

export type ExternalCityConfigRow = {
  city: string
  state: string
  source_platform: string
  source_pages: unknown
  source_crawl_excluded_at?: string | null
}

export type PartitionCrawlableExternalConfigsResult = {
  crawlable: ExternalCityConfigRow[]
  configsCrawlable: number
  configsSkippedNoSourcePages: number
  configsSkippedInvalidUrls: number
  configsSkippedCrawlExcluded: number
}

/**
 * Splits enabled external_page_source configs into crawlable rows (≥1 HTTPS list URL)
 * vs placeholders skipped at load time (empty pages vs non-HTTPS-only entries).
 */
export function partitionCrawlableExternalCityConfigs(
  rows: ExternalCityConfigRow[]
): PartitionCrawlableExternalConfigsResult {
  const crawlable: ExternalCityConfigRow[] = []
  let configsSkippedNoSourcePages = 0
  let configsSkippedInvalidUrls = 0
  let configsSkippedCrawlExcluded = 0

  for (const row of rows) {
    if (row.source_platform !== 'external_page_source') {
      continue
    }
    if (row.source_crawl_excluded_at != null && row.source_crawl_excluded_at !== '') {
      configsSkippedCrawlExcluded += 1
      continue
    }
    const normalizedPages = normalizeSourcePages(row.source_pages)
    if (normalizedPages.length > 0) {
      crawlable.push(row)
      continue
    }
    if (!Array.isArray(row.source_pages) || row.source_pages.length === 0) {
      configsSkippedNoSourcePages += 1
    } else {
      configsSkippedInvalidUrls += 1
    }
  }

  return {
    crawlable,
    configsCrawlable: crawlable.length,
    configsSkippedNoSourcePages,
    configsSkippedInvalidUrls,
    configsSkippedCrawlExcluded,
  }
}
