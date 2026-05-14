import { urlSuggestsNonListingPhoto } from '@/lib/ingestion/nonSaleImageHeuristics'

export interface PlaceholderDetectionResult {
  readonly isPlaceholder: boolean
  readonly reasons: readonly string[]
}

const DESCRIPTION_PHRASES: readonly string[] = [
  'coming soon',
  'more information coming soon',
  'pictures coming soon',
  'details coming soon',
  'check back soon',
  'more photos to come',
  'information and pictures coming soon',
  'more information and pictures coming soon',
]

function normalizeDescriptionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

function hasPlaceholderPhrase(text: string): boolean {
  const n = normalizeDescriptionText(text)
  if (!n) return false
  return DESCRIPTION_PHRASES.some((p) => n.includes(p))
}

function isLogoOnlyImages(imageUrls: readonly string[]): boolean {
  if (imageUrls.length === 0) return true
  const reasons = imageUrls.map((u) => urlSuggestsNonListingPhoto(u))
  return reasons.every((r) => r !== null)
}

/**
 * Deterministic placeholder detection for external listings (pure function).
 */
export function detectPlaceholderListing(input: {
  readonly description: string | null | undefined
  readonly imageUrls: readonly string[]
}): PlaceholderDetectionResult {
  const reasons: string[] = []
  const desc = typeof input.description === 'string' ? input.description : ''
  if (hasPlaceholderPhrase(desc)) {
    reasons.push('description_placeholder_phrase')
  }
  const urls = input.imageUrls.filter((u) => typeof u === 'string' && u.trim().length > 0)
  if (urls.length === 0) {
    reasons.push('no_images')
  } else if (urls.length === 1) {
    reasons.push('single_image')
  }
  if (urls.length > 0 && isLogoOnlyImages(urls)) {
    reasons.push('branding_or_non_listing_images_only')
  }
  const sortedReasons = [...reasons].sort((a, b) => a.localeCompare(b))
  return {
    isPlaceholder: sortedReasons.length > 0,
    reasons: sortedReasons,
  }
}
