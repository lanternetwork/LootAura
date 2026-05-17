import { dedupeImageUrlsPreserveOrder } from '@/lib/ingestion/nonSaleImageHeuristics'
import {
  isRejectedListingImageUrl,
  normalizeListingImageHttpsUrl,
} from '@/lib/ingestion/images/normalizeListingImageUrl'

/**
 * Normalize, reject branding/chrome URLs (shared with publish + extension heuristics), dedupe, cap.
 */
export function filterValidListingImageUrls(
  rawUrls: readonly string[],
  baseUrl: string,
  maxImages: number
): { imageUrls: string[]; rejectedCount: number } {
  const out: string[] = []
  const seen = new Set<string>()
  let rejectedCount = 0

  for (const raw of rawUrls) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const normalized = normalizeListingImageHttpsUrl(raw, baseUrl)
    if (!normalized) {
      rejectedCount += 1
      continue
    }
    if (isRejectedListingImageUrl(normalized)) {
      rejectedCount += 1
      continue
    }
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
    if (out.length >= maxImages) break
  }

  return { imageUrls: dedupeImageUrlsPreserveOrder(out).slice(0, maxImages), rejectedCount }
}
