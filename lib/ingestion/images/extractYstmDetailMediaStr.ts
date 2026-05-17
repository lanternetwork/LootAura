import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'
import {
  isRejectedListingImageUrl,
  normalizeListingImageHttpsUrl,
} from '@/lib/ingestion/images/normalizeListingImageUrl'
import { imageUrlFingerprints } from '@/lib/ingestion/images/imageUrlFingerprint'

function decodeJsSingleQuotedLiteral(raw: string): string {
  return raw
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\//g, '/')
}

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

  const m = html.match(/(?:const|let|var)\s+mediaStr\s*=\s*'([\s\S]*?)'\s*;/i)
  if (!m?.[1]) return empty

  const obj = parseMediaStrObject(decodeJsSingleQuotedLiteral(m[1]))
  if (!obj) return { ...empty, mediaStrFound: true }

  const baseRaw = typeof obj.baseUrl === 'string' ? obj.baseUrl.trim() : ''
  const baseUrl = baseRaw ? normalizeListingImageHttpsUrl(baseRaw, pageUrl) : null
  if (!baseUrl || !Array.isArray(obj.media) || obj.media.length === 0) {
    return { ...empty, mediaStrFound: true, baseUrl }
  }

  const out: string[] = []
  const seen = new Set<string>()
  let rejectedCount = 0

  for (const item of obj.media) {
    if (typeof item !== 'string' || !item.trim()) continue
    const normalized = normalizeListingImageHttpsUrl(item, baseUrl)
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

  return {
    mediaStrFound: true,
    baseUrl,
    imageUrls: out,
    rejectedCount,
    urlFingerprints: imageUrlFingerprints(out),
  }
}
