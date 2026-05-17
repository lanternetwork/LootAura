export const INGESTED_IMAGE_ENRICHMENT_DETAILS_SCHEMA_VERSION = 1 as const

export type IngestedImageEnrichmentDetails = {
  schema_version: typeof INGESTED_IMAGE_ENRICHMENT_DETAILS_SCHEMA_VERSION
  recorded_at: string
  detailHtmlParsed?: boolean
  detailAttemptSource?: 'address_enrichment' | 'image_enrichment'
  skipReason?: string
  mediaStrFound?: boolean
  validImageCount?: number
  rejectedCount?: number
  urlFingerprints?: string[]
  attemptCount?: number
}

export function readIngestedImageEnrichmentDetails(
  failureDetails: unknown
): IngestedImageEnrichmentDetails | null {
  if (!failureDetails || typeof failureDetails !== 'object' || Array.isArray(failureDetails)) {
    return null
  }
  const raw = (failureDetails as Record<string, unknown>).image_enrichment
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (typeof rec.recorded_at !== 'string') return null
  return raw as IngestedImageEnrichmentDetails
}

export function mergeIngestedImageEnrichmentDetails(
  existing: unknown,
  patch: Omit<IngestedImageEnrichmentDetails, 'schema_version' | 'recorded_at'> &
    Partial<Pick<IngestedImageEnrichmentDetails, 'schema_version' | 'recorded_at'>>
): Record<string, unknown> {
  const prior =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  prior.image_enrichment = {
    schema_version: INGESTED_IMAGE_ENRICHMENT_DETAILS_SCHEMA_VERSION,
    recorded_at: patch.recorded_at ?? new Date().toISOString(),
    ...patch,
  }
  return prior
}

/** Skip redundant detail fetches when address/image worker already parsed HTML recently. */
export function shouldSkipRedundantDetailImageFetch(
  failureDetails: unknown,
  cooldownMinutes: number,
  nowMs: number = Date.now()
): boolean {
  const details = readIngestedImageEnrichmentDetails(failureDetails)
  if (!details?.detailHtmlParsed || !details.recorded_at) return false
  const recordedMs = Date.parse(details.recorded_at)
  if (!Number.isFinite(recordedMs)) return false
  const cooldownMs = Math.max(0, cooldownMinutes) * 60_000
  return nowMs - recordedMs < cooldownMs
}
