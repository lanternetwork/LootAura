import { addressLineFromYstmListingUrlSlug, slugSegmentToAddressLine } from '@/lib/ingestion/ystmAddressSlug'
import { parseYstmListingPathParts } from '@/lib/ingestion/ystmListingCityAuthority'

/** Slug segment matches See-source-for-address-after-* (case-insensitive). */
const SEE_SOURCE_AFTER_SLUG_RE =
  /^see-source-for-address-after-(\d{4}-\d{2}-\d{2}-\d{2}(?:%3A|:)\d{2}(?:%3A|:)\d{2})$/i

export function isSeeSourceGatedSlugSegment(segment: string | null | undefined): boolean {
  if (!segment) return false
  const decoded = decodeURIComponent(segment.trim())
  return SEE_SOURCE_AFTER_SLUG_RE.test(decoded) || /^see-source-for-address/i.test(decoded)
}

/**
 * Parse unlock instant from See-source-for-address-after-YYYY-MM-DD-HH:mm:ss slug segment.
 * Returns null when not a gated slug or timestamp is invalid.
 */
export function parseSeeSourceUnlockAtFromSlug(segment: string | null | undefined): Date | null {
  if (!segment) return null
  const decoded = decodeURIComponent(segment.trim())
  const m = decoded.match(
    /^see-source-for-address-after-(\d{4})-(\d{2})-(\d{2})-(\d{2})(?:%3A|:)(\d{2})(?:%3A|:)(\d{2})$/i
  )
  if (!m) return null
  const year = Number.parseInt(m[1]!, 10)
  const month = Number.parseInt(m[2]!, 10)
  const day = Number.parseInt(m[3]!, 10)
  const hour = Number.parseInt(m[4]!, 10)
  const minute = Number.parseInt(m[5]!, 10)
  const second = Number.parseInt(m[6]!, 10)
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day ||
    d.getUTCHours() !== hour ||
    d.getUTCMinutes() !== minute ||
    d.getUTCSeconds() !== second
  ) {
    return null
  }
  return d
}

export function parseSeeSourceUnlockAtFromListingUrl(sourceUrl: string | null | undefined): Date | null {
  if (!sourceUrl?.trim()) return null
  const parts = parseYstmListingPathParts(sourceUrl)
  if (!parts?.addressSlugSegment) return null
  return parseSeeSourceUnlockAtFromSlug(parts.addressSlugSegment)
}

export type GatedListingDiagnostics = {
  slugWasPlaceholder?: boolean
  chosenAddressSource?: string
  /** EstateSales.NET: ISO timestamp before full address is shown. */
  utcShowAddressAfter?: string | null
}

/**
 * Deterministic gated detection (D1): not userlisting.html alone.
 * Gated when slug is See-source placeholder, slug-derived address is null from placeholder,
 * or list parse left no trusted address on a See-source URL.
 */
export function detectGatedListing(input: {
  sourceUrl: string | null | undefined
  addressRaw: string | null | undefined
  diagnostics?: GatedListingDiagnostics
}): { gated: boolean; unlockAt: Date | null; slugWasPlaceholder: boolean } {
  const utcAfter = input.diagnostics?.utcShowAddressAfter
  if (!input.addressRaw?.trim() && typeof utcAfter === 'string' && utcAfter.trim()) {
    const unlockAt = new Date(utcAfter.trim())
    if (Number.isFinite(unlockAt.getTime())) {
      const gated = unlockAt.getTime() > Date.now()
      return { gated, unlockAt, slugWasPlaceholder: false }
    }
  }

  const url = input.sourceUrl?.trim() ?? ''
  const parts = url ? parseYstmListingPathParts(url) : null
  const slug = parts?.addressSlugSegment ?? null
  const slugLine = slug ? slugSegmentToAddressLine(slug) : null
  const slugWasPlaceholder = Boolean(slug && !slugLine)
  const unlockAt = parseSeeSourceUnlockAtFromSlug(slug)

  if (isSeeSourceGatedSlugSegment(slug)) {
    const hasUsableAddress = Boolean(input.addressRaw?.trim())
    if (!hasUsableAddress) {
      return { gated: true, unlockAt, slugWasPlaceholder: true }
    }
    return { gated: false, unlockAt, slugWasPlaceholder: true }
  }

  if (slugWasPlaceholder || input.diagnostics?.slugWasPlaceholder === true) {
    const chosen = input.diagnostics?.chosenAddressSource
    if (!input.addressRaw?.trim() && (chosen === 'none' || chosen === undefined)) {
      return { gated: true, unlockAt, slugWasPlaceholder: true }
    }
  }

  if (!input.addressRaw?.trim() && url) {
    const recovered = addressLineFromYstmListingUrlSlug(url)
    if (recovered == null && slug && /^see-source-for-address/i.test(decodeURIComponent(slug))) {
      return { gated: true, unlockAt, slugWasPlaceholder: true }
    }
  }

  return { gated: false, unlockAt, slugWasPlaceholder }
}

/** Bounded jitter (ms) after unlock/backoff scheduling. */
export function enrichmentScheduleJitterMs(seed?: string): number {
  if (!seed) {
    return Math.floor(Math.random() * 120_000)
  }
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 120_000
}

export function computeNextEnrichmentAttemptAt(unlockAt: Date | null, nowMs: number, seed: string): Date {
  const base = unlockAt && unlockAt.getTime() > nowMs ? unlockAt.getTime() : nowMs
  return new Date(base + enrichmentScheduleJitterMs(seed))
}
