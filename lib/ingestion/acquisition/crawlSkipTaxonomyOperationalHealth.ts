import type { CrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import type { DetailFirstOperationalAlert } from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

export type CrawlSkipTaxonomyOperationalHealth = {
  healthy: boolean
  alerts: DetailFirstOperationalAlert[]
}

/** Minimum classified skips before suspicious-share alerts fire. */
export const CRAWL_SKIP_TAXONOMY_MIN_SAMPLES = 20

/** Alert when suspicious sub-reasons exceed this share of classified skips (not total duplicate %). */
export const CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING = 0.15

export function evaluateCrawlSkipTaxonomyOperationalHealth(
  rollup: CrawlSkipTaxonomyRollup
): CrawlSkipTaxonomyOperationalHealth {
  const alerts: DetailFirstOperationalAlert[] = []
  if (rollup.total < CRAWL_SKIP_TAXONOMY_MIN_SAMPLES) {
    return { healthy: true, alerts }
  }

  const share = rollup.suspiciousShare
  if (share != null && share >= CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING) {
    alerts.push({
      level: 'warning',
      code: 'crawl_skip_suspicious_share_elevated',
      message: `Suspicious crawl skips are ${(share * 100).toFixed(1)}% of classified skips (${rollup.suspicious}/${rollup.total}); investigate date/location/content-change suppressions — not total duplicate rate.`,
    })
  }

  return { healthy: alerts.length === 0, alerts }
}
