import { extractPublishImageCandidates } from '@/lib/ingestion/publishImageCandidates'
import { isRejectedListingImageUrl } from '@/lib/ingestion/images/normalizeListingImageUrl'

export type MergeIngestedSaleImageFieldsResult = {
  imageSourceUrl: string | null
  rawPayload: Record<string, unknown>
  updated: boolean
  mergedCount: number
  preservedExisting: boolean
}

function rawPayloadRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  return {}
}

function filterValidExisting(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    const t = u.trim()
    if (!t || seen.has(t) || isRejectedListingImageUrl(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * Merge new image URLs into ingested row fields without overwriting valid existing URLs.
 * Existing URLs (from raw_payload.imageUrls + image_source_url) keep their order; new URLs append.
 */
export function mergeIngestedSaleImageFields(input: {
  existingImageSourceUrl: string | null | undefined
  existingRawPayload: unknown
  newUrls: string[]
}): MergeIngestedSaleImageFieldsResult {
  const existing = filterValidExisting(
    extractPublishImageCandidates(input.existingRawPayload, input.existingImageSourceUrl)
  )
  const rawPayload = rawPayloadRecord(input.existingRawPayload)

  if (existing.length > 0 && input.newUrls.length === 0) {
    return {
      imageSourceUrl: existing[0] ?? null,
      rawPayload,
      updated: false,
      mergedCount: existing.length,
      preservedExisting: true,
    }
  }

  const seen = new Set<string>(existing)
  const merged = [...existing]
  for (const raw of input.newUrls) {
    const t = raw.trim()
    if (!t || seen.has(t) || isRejectedListingImageUrl(t)) continue
    seen.add(t)
    merged.push(t)
  }

  const imageSourceUrl = merged[0] ?? null
  const nextPayload = { ...rawPayload }
  if (merged.length > 0) {
    nextPayload.imageUrls = merged
  } else if ('imageUrls' in nextPayload) {
    delete nextPayload.imageUrls
  }

  const priorUrls = existing
  const updated =
    merged.length !== priorUrls.length ||
    merged.some((u, i) => u !== priorUrls[i]) ||
    (input.existingImageSourceUrl?.trim() || null) !== imageSourceUrl

  return {
    imageSourceUrl,
    rawPayload: nextPayload,
    updated,
    mergedCount: merged.length,
    preservedExisting: priorUrls.length > 0,
  }
}
