import { isSeeSourceGatedSlugSegment } from '@/lib/ingestion/address/addressGated'
import { parseYstmListingPathParts } from '@/lib/ingestion/ystmListingCityAuthority'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'

/** Matches `PublishInputSchema.address` max length. */
export const PUBLISH_ADDRESS_MAX_LENGTH = 500 as const

/**
 * Round sale time to nearest 30-minute increment (matches `PublishInputSchema` TimeSchema).
 * Examples: 09:14 → 09:00, 09:15 → 09:30, 09:45 → 10:00.
 */
export function roundTimeToNearest30Minutes(value: string | null | undefined): string | null {
  if (value == null || !String(value).trim()) return null
  const trimmed = String(value).trim()
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return trimmed

  const hours = Number.parseInt(match[1]!, 10)
  const minutes = Number.parseInt(match[2]!, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return trimmed

  const totalMinutes = hours * 60 + minutes
  const roundedTotal = Math.round(totalMinutes / 30) * 30
  const dayMinutes = ((roundedTotal % (24 * 60)) + 24 * 60) % (24 * 60)
  const roundedHours = Math.floor(dayMinutes / 60)
  const roundedMinutes = dayMinutes % 60

  return `${String(roundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}:00`
}

/** Trim and cap publish address line without emptying a non-empty input. */
export function capAddressForPublishSchema(
  address: string | null | undefined,
  maxLength: number = PUBLISH_ADDRESS_MAX_LENGTH
): string | null {
  if (address == null) return null
  const line = String(address).replace(/\s+/g, ' ').trim()
  if (!line) return null
  if (line.length <= maxLength) return line
  const truncated = line.slice(0, maxLength).trim()
  return truncated || null
}

export function isResolvedAddressPublishable(
  normalizedAddress: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined
): boolean {
  const cityT = (city ?? '').trim()
  const stateT = (state ?? '').trim()
  const address = normalizeAddressForPublish(normalizedAddress ?? null, cityT, stateT)
  try {
    validateResolvedAddressForPublish(address, cityT, stateT)
    return true
  } catch {
    return false
  }
}

export type IngestedRowPublishPreflight = {
  normalized_address?: string | null
  city?: string | null
  state?: string | null
  source_url?: string | null
  address_status?: string | null
}

export function sourceUrlIndicatesHiddenAddress(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl?.trim()) return false
  const parts = parseYstmListingPathParts(sourceUrl)
  if (!parts?.addressSlugSegment) return false
  return isSeeSourceGatedSlugSegment(parts.addressSlugSegment)
}

/** True when same-run publish should be skipped until a publishable street line exists. */
export function shouldDeferPublishForPendingAddress(row: IngestedRowPublishPreflight): boolean {
  return !isResolvedAddressPublishable(row.normalized_address, row.city, row.state)
}
