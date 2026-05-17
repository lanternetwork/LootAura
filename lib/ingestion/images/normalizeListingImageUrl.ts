import { urlSuggestsNonListingPhoto } from '@/lib/ingestion/nonSaleImageHeuristics'

export function normalizeListingImageHttpsUrl(raw: string, baseUrl: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(
          trimmed.replace(/^\//, ''),
          baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
        )
    if (url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

export function isRejectedListingImageUrl(url: string): boolean {
  return urlSuggestsNonListingPhoto(url) != null
}
