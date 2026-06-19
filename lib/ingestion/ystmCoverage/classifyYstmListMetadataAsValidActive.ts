import { isYstmPlaceholderAddressLine } from '@/lib/ingestion/acquisition/ystmDetailPageAddressResolver'
import { isYstmIngestibleListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { parseYstmListingPathParts } from '@/lib/ingestion/ystmListingCityAuthority'
import {
  coerceIngestedDateToYyyyMmDd,
  hasPastEndDate,
  isSaleWindowExpiredAtDiscovery,
} from '@/lib/ingestion/saleWindowDates'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import type { YstmCoverageValidityResult } from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'

export function deriveYstmListMetadataTitle(sale: Pick<YstmListMetadataSale, 'title' | 'sourceUrl'>): string | null {
  if (sale.title?.trim()) return sale.title.trim()
  const parsed = parseYstmListingPathParts(sale.sourceUrl)
  if (parsed?.addressSlugSegment && !/see-source-for-address/i.test(parsed.addressSlugSegment)) {
    return parsed.addressSlugSegment.replace(/-/g, ' ')
  }
  return 'External listing yard sale'
}

function hasUsableAddress(address: string | null | undefined): boolean {
  if (!address?.trim()) return false
  if (isYstmPlaceholderAddressLine(address)) return false
  return true
}

function hasUsableCoords(lat: number | null, lng: number | null): boolean {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
}

/**
 * Whether a metadataStr list row represents a valid active sale (no detail fetch required).
 */
export function classifyYstmListMetadataAsValidActive(
  sale: YstmListMetadataSale
): YstmCoverageValidityResult {
  if (!isYstmIngestibleListingUrl(sale.sourceUrl)) {
    return { valid: false, reason: 'unparseable_detail' }
  }
  const title = deriveYstmListMetadataTitle(sale)
  if (!title?.trim()) {
    return { valid: false, reason: 'missing_title' }
  }
  if (!coerceIngestedDateToYyyyMmDd(sale.startDate) && !coerceIngestedDateToYyyyMmDd(sale.endDate)) {
    return { valid: false, reason: 'missing_dates' }
  }
  if (
    isSaleWindowExpiredAtDiscovery(sale.startDate, sale.endDate) ||
    hasPastEndDate(sale.endDate, sale.startDate)
  ) {
    return { valid: false, reason: 'expired' }
  }
  if (!hasUsableCoords(sale.lat, sale.lng) && !hasUsableAddress(sale.address)) {
    return { valid: false, reason: 'gated_only' }
  }
  return { valid: true }
}
