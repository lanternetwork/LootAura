function extractRawPayloadImageCandidates(rawPayload: unknown): string[] {
  if (!rawPayload || typeof rawPayload !== 'object') return []
  const imageUrls = (rawPayload as { imageUrls?: unknown }).imageUrls
  if (!Array.isArray(imageUrls)) return []
  return imageUrls.filter((value): value is string => typeof value === 'string')
}

/** Image URLs for publish: `raw_payload.imageUrls` first, then `image_source_url`, deduped in order. */
export function extractPublishImageCandidates(
  rawPayload: unknown,
  imageSourceUrl: string | null | undefined
): string[] {
  const fromPayload = extractRawPayloadImageCandidates(rawPayload)
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of fromPayload) {
    const t = u.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  if (typeof imageSourceUrl === 'string') {
    const t = imageSourceUrl.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}
