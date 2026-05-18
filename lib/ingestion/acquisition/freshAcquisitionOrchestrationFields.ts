/** Aggregated crawl totals for orchestration notes + funnel rollups. */
export type FreshAcquisitionCrawlTotals = {
  skippedExpired: number
  freshInserted: number
  duplicateExistingUrl: number
  duplicateCrossCityPage: number
  duplicateCanonicalCollision: number
  duplicateExpiredRow: number
}

export function freshAcquisitionOrchestrationFields(
  totals: FreshAcquisitionCrawlTotals
): FreshAcquisitionCrawlTotals {
  return {
    skippedExpired: totals.skippedExpired,
    freshInserted: totals.freshInserted,
    duplicateExistingUrl: totals.duplicateExistingUrl,
    duplicateCrossCityPage: totals.duplicateCrossCityPage,
    duplicateCanonicalCollision: totals.duplicateCanonicalCollision,
    duplicateExpiredRow: totals.duplicateExpiredRow,
  }
}
