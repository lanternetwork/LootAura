import type { ExternalPageSourceListing } from '@/lib/ingestion/adapters/externalPageSource'

/**
 * Detail-first persists `image_source_url` from the parsed listing but stores `raw_payload`
 * from the pre-detail rowPayload. Copy parsed `listing.rawPayload.imageUrls` so publish
 * and admin queries see the full gallery (up to MAX_IMPORTED_LISTING_IMAGES).
 */
export function mergeListingImageUrlsIntoRowPayload(
  rowPayload: Record<string, unknown>,
  listing: Pick<ExternalPageSourceListing, 'rawPayload'>
): Record<string, unknown> {
  const next = { ...rowPayload }
  const rp = listing.rawPayload
  if (!rp || typeof rp !== 'object' || Array.isArray(rp)) {
    return next
  }
  const imageUrls = (rp as { imageUrls?: unknown }).imageUrls
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return next
  }
  const urls = imageUrls
    .filter((u): u is string => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => u.length > 0)
  if (urls.length > 0) {
    next.imageUrls = urls
  }
  return next
}
