import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'

export const PLACEHOLDER_UNRESOLVED_REASON = 'placeholder_unresolved'

export type DiscoveryHealingRow = {
  source_discovery_status: string
  source_pages: unknown
  source_crawl_excluded_at?: string | null
}

export function isManualDiscoveryRow(row: DiscoveryHealingRow): boolean {
  return row.source_discovery_status === SOURCE_DISCOVERY_STATUS.manual
}

/** Rows permanently excluded from automated healing and crawl rotation. */
export function isCrawlExcludedDiscoveryRow(row: DiscoveryHealingRow): boolean {
  return row.source_crawl_excluded_at != null && row.source_crawl_excluded_at !== ''
}

export function shouldExcludePlaceholderFromCrawl(
  failureReason: string,
  nextFailureCount: number,
  threshold: number
): boolean {
  if (failureReason !== PLACEHOLDER_UNRESOLVED_REASON) return false
  return nextFailureCount >= threshold
}
