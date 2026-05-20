/**
 * Maps ingestion schedule provenance to ingested_sales.time_source (CHECK constraint).
 * Provenance for YSTM detail times also lives in date_source / raw_payload.detailTimeStart.
 */
export function ingestedSaleTimeSourceForDb(timeSource: string | null | undefined): string | null {
  const value = timeSource?.trim()
  if (!value) return null
  if (value === 'explicit' || value === 'default') return value
  if (value === 'ystm_detail_page') return 'explicit'
  return 'explicit'
}
