import {
  type ExternalCrawlSkipSubReasonCounts,
  benignCrawlSkipSubReasons,
  suspiciousCrawlSkipSubReasons,
  totalCrawlSkipSubReasons,
} from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'

/** Aggregated crawl totals for orchestration notes + funnel rollups. */
export type FreshAcquisitionCrawlTotals = {
  skippedExpired: number
  freshInserted: number
  duplicateExistingUrl: number
  duplicateCrossCityPage: number
  duplicateCanonicalCollision: number
  duplicateExpiredRow: number
  crawlSkipSubReasons: ExternalCrawlSkipSubReasonCounts
}

export function freshAcquisitionOrchestrationFields(
  totals: FreshAcquisitionCrawlTotals
): FreshAcquisitionCrawlTotals & {
  crawlSkipSuspicious: number
  crawlSkipBenign: number
  crawlSkipSubReasonTotal: number
} {
  return {
    skippedExpired: totals.skippedExpired,
    freshInserted: totals.freshInserted,
    duplicateExistingUrl: totals.duplicateExistingUrl,
    duplicateCrossCityPage: totals.duplicateCrossCityPage,
    duplicateCanonicalCollision: totals.duplicateCanonicalCollision,
    duplicateExpiredRow: totals.duplicateExpiredRow,
    crawlSkipSubReasons: totals.crawlSkipSubReasons,
    crawlSkipSuspicious: suspiciousCrawlSkipSubReasons(totals.crawlSkipSubReasons),
    crawlSkipBenign: benignCrawlSkipSubReasons(totals.crawlSkipSubReasons),
    crawlSkipSubReasonTotal: totalCrawlSkipSubReasons(totals.crawlSkipSubReasons),
  }
}
