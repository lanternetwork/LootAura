import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'
import { filterValidListingImageUrls } from '@/lib/ingestion/images/filterValidListingImageUrls'
import { imageUrlFingerprints } from '@/lib/ingestion/images/imageUrlFingerprint'
import { normalizeListingImageHttpsUrl } from '@/lib/ingestion/images/normalizeListingImageUrl'
import { extractYstmMediaStrJsonLiteral } from '@/lib/ingestion/images/ystmDetailMediaStrLiteral'

export type YstmMediaStrExtractionResult = {
  mediaStrFound: boolean
  baseUrl: string | null
  imageUrls: string[]
  rejectedCount: number
  urlFingerprints: string[]
}

function parseMediaStrObject(decodedJson: string): { baseUrl?: string; media?: unknown } | null {
  try {
    const parsed = JSON.parse(decodedJson) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as { baseUrl?: string; media?: unknown }
  } catch {
    return null
  }
}

/**
 * Extract listing image URLs from YSTM detail-page static HTML `mediaStr` blob.
 * Does not execute JS; reads inline script assignment only.
 */
export function extractYstmDetailMediaStrFromHtml(
  html: string,
  pageUrl: string,
  maxImages: number = MAX_IMPORTED_LISTING_IMAGES
): YstmMediaStrExtractionResult {
  const empty: YstmMediaStrExtractionResult = {
    mediaStrFound: false,
    baseUrl: null,
    imageUrls: [],
    rejectedCount: 0,
    urlFingerprints: [],
  }

  const literal = extractYstmMediaStrJsonLiteral(html)
  if (!literal) return empty

  const obj = parseMediaStrObject(literal)
  if (!obj) return { ...empty, mediaStrFound: true }

  const baseRaw = typeof obj.baseUrl === 'string' ? obj.baseUrl.trim() : ''
  const baseUrl = baseRaw ? normalizeListingImageHttpsUrl(baseRaw, pageUrl) : null
  if (!baseUrl || !Array.isArray(obj.media) || obj.media.length === 0) {
    return { ...empty, mediaStrFound: true, baseUrl }
  }

  const mediaStrings = obj.media.filter((item): item is string => typeof item === 'string' && !!item.trim())
  const filtered = filterValidListingImageUrls(mediaStrings, baseUrl, maxImages)

  return {
    mediaStrFound: true,
    baseUrl,
    imageUrls: filtered.imageUrls,
    rejectedCount: filtered.rejectedCount,
    urlFingerprints: imageUrlFingerprints(filtered.imageUrls),
  }
}
