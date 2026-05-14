import { createHash } from 'crypto'
import type { IngestFingerprint } from '@/lib/reconciliation/types'

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function normalizeTitleForHash(title: string | null | undefined): string {
  if (title == null) return ''
  return normalizeWhitespace(title).toLowerCase()
}

export function normalizeDescriptionForHash(description: string | null | undefined): string {
  if (description == null) return ''
  return normalizeWhitespace(description).toLowerCase()
}

/** Deterministic sorted image URL list for hashing. */
export function normalizeImageUrlsForHash(urls: readonly string[]): string[] {
  const cleaned = urls
    .map((u) => normalizeWhitespace(u))
    .filter((u) => u.length > 0)
  const unique = Array.from(new Set(cleaned))
  unique.sort((a, b) => a.localeCompare(b))
  return unique
}

export function computeContentHash(title: string | null | undefined, description: string | null | undefined): string {
  const t = normalizeTitleForHash(title)
  const d = normalizeDescriptionForHash(description)
  return sha256Hex(JSON.stringify({ title: t, description: d }))
}

export function computeScheduleHash(input: {
  readonly dateStart: string | null | undefined
  readonly dateEnd: string | null | undefined
  readonly timeStart: string | null | undefined
  readonly timeEnd: string | null | undefined
  readonly listingTimezone: string | null | undefined
  /** Hours embedded in prose (e.g. "9:00 AM to 3:00 PM") when structured times are absent. */
  readonly descriptionScheduleAux?: string | null | undefined
}): string {
  const payload = {
    dateStart: input.dateStart ?? '',
    dateEnd: input.dateEnd ?? '',
    timeStart: normalizeWhitespace(input.timeStart ?? ''),
    timeEnd: normalizeWhitespace(input.timeEnd ?? ''),
    listingTimezone: normalizeWhitespace((input.listingTimezone ?? '').toLowerCase()),
    descriptionScheduleAux: normalizeWhitespace(input.descriptionScheduleAux ?? ''),
  }
  return sha256Hex(JSON.stringify(payload))
}

export function computeImageHash(imageUrls: readonly string[]): string {
  const normalized = normalizeImageUrlsForHash(imageUrls)
  return sha256Hex(JSON.stringify(normalized))
}

export function fingerprintFromParts(parts: {
  readonly title: string | null | undefined
  readonly description: string | null | undefined
  readonly dateStart: string | null | undefined
  readonly dateEnd: string | null | undefined
  readonly timeStart: string | null | undefined
  readonly timeEnd: string | null | undefined
  readonly listingTimezone: string | null | undefined
  readonly imageUrls: readonly string[]
}): IngestFingerprint {
  const descAux = extractScheduleWindowTokenFromText(parts.description)
  return {
    contentHash: computeContentHash(parts.title, parts.description),
    scheduleHash: computeScheduleHash({
      dateStart: parts.dateStart,
      dateEnd: parts.dateEnd,
      timeStart: parts.timeStart,
      timeEnd: parts.timeEnd,
      listingTimezone: parts.listingTimezone,
      descriptionScheduleAux: descAux,
    }),
    imageHash: computeImageHash(parts.imageUrls),
  }
}

/**
 * Best-effort extraction of a single opening/closing time window from free text (deterministic).
 * Used so schedule hash can react to hours embedded in descriptions when structured times are null.
 */
export function extractScheduleWindowTokenFromText(text: string | null | undefined): string {
  if (text == null) return ''
  const norm = text.replace(/\s+/g, ' ').trim()
  if (!norm) return ''
  const m = norm.match(
    /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:to|-|through)\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i
  )
  if (!m) return ''
  return `${m[1].toUpperCase().replace(/\s+/g, '')}->${m[2].toUpperCase().replace(/\s+/g, '')}`
}
