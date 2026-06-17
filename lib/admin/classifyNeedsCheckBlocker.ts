import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'
import { isCoordinatePrecisionPublishable } from '@/lib/geocode/geocodePrecisionPolicy'
import type { FailureReason } from '@/lib/ingestion/types'
import type { NeedsCheckBlockerCategory, NeedsCheckRepairOwner } from '@/lib/admin/needsCheckRootCauseTypes'

export type NeedsCheckClassificationInput = {
  addressStatus: string | null
  coordinatePrecision: string | null
  failureDetails: unknown
  failureReasons: unknown
  lat: number | null
  lng: number | null
  normalizedAddress: string | null
  city: string | null
  state: string | null
  dateStart: string | null
  dateEnd: string | null
  nowMs?: number
}

export const NEEDS_CHECK_CLASSIFICATION_RULES_SUMMARY = [
  'Mutually exclusive categories; first matching rule wins (precedence top → bottom).',
  '1. geocode_blocked — failure_details.geocode_dead_letter present.',
  '2. address_gated — address_status = address_gated (enrichment waiting / schedule-gated).',
  '3. address_enrichment_terminal — address_status = address_unavailable_terminal (enrichment exhausted).',
  '4. address_enrichment_retryable — address_status ∈ {address_enrichment_pending, address_enrichment_retry}.',
  '5. precision_gated — coordinate_precision ∈ {locality, city_centroid} (non-publishable precision policy).',
  '6. publish_eligible_today — address_status = address_available, publishable precision, coordinates present, address passes publish validation, listing not past end date.',
  '7. other — remainder.',
].join('\n')

const ENRICHMENT_RETRYABLE_STATUSES = new Set([
  'address_enrichment_pending',
  'address_enrichment_retry',
])

function readFailureDetailsObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function hasGeocodeDeadLetter(failureDetails: unknown): boolean {
  const root = readFailureDetailsObject(failureDetails)
  if (!root) return false
  const dl = root.geocode_dead_letter
  return dl != null && typeof dl === 'object' && !Array.isArray(dl)
}

export function hasAddressEnrichmentDetails(failureDetails: unknown): boolean {
  const root = readFailureDetailsObject(failureDetails)
  if (!root) return false
  const section = root.address_enrichment
  return section != null && typeof section === 'object' && !Array.isArray(section)
}

function toFailureReasonArray(value: unknown): FailureReason[] {
  if (!Array.isArray(value)) return []
  return value.filter((x): x is FailureReason => typeof x === 'string')
}

function isPastEndDate(dateEnd: string | null, nowMs: number): boolean {
  if (!dateEnd) return false
  const end = new Date(`${dateEnd}T23:59:59.999Z`)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() < nowMs
}

function passesPublishAddressValidation(input: NeedsCheckClassificationInput): boolean {
  const city = input.city?.trim() ?? ''
  const state = input.state?.trim() ?? ''
  if (!city || !state) return false
  try {
    validateResolvedAddressForPublish(input.normalizedAddress, city, state)
    return true
  } catch {
    return false
  }
}

/**
 * Classify one `needs_check` row into a mutually exclusive blocker category.
 * Precedence is documented in `NEEDS_CHECK_CLASSIFICATION_RULES_SUMMARY`.
 */
export function classifyNeedsCheckBlocker(input: NeedsCheckClassificationInput): NeedsCheckBlockerCategory {
  const nowMs = input.nowMs ?? Date.now()

  if (hasGeocodeDeadLetter(input.failureDetails)) {
    return 'geocode_blocked'
  }

  const addressStatus = input.addressStatus ?? ''
  if (addressStatus === 'address_gated') {
    return 'address_gated'
  }

  if (addressStatus === 'address_unavailable_terminal') {
    return 'address_enrichment_terminal'
  }

  if (ENRICHMENT_RETRYABLE_STATUSES.has(addressStatus)) {
    return 'address_enrichment_retryable'
  }

  if (!isCoordinatePrecisionPublishable(input.coordinatePrecision)) {
    return 'precision_gated'
  }

  const hasCoordinates = input.lat != null && input.lng != null
  const addressReady = addressStatus === 'address_available'
  const notExpired = !isPastEndDate(input.dateEnd, nowMs)
  const hasSchedule = Boolean(input.dateStart?.trim())

  if (
    addressReady &&
    hasCoordinates &&
    hasSchedule &&
    notExpired &&
    passesPublishAddressValidation(input)
  ) {
    return 'publish_eligible_today'
  }

  return 'other'
}

export function blockerCategoryToRepairOwner(category: NeedsCheckBlockerCategory): NeedsCheckRepairOwner {
  switch (category) {
    case 'address_enrichment_retryable':
    case 'address_gated':
      return 'address_enrichment'
    case 'address_enrichment_terminal':
      return 'other'
    case 'precision_gated':
      return 'precision_handling'
    case 'geocode_blocked':
      return 'geocoding'
    case 'publish_eligible_today':
      return 'catalog_repair'
    default:
      return 'other'
  }
}

export function publishabilityProfileForCategory(category: NeedsCheckBlockerCategory): string {
  switch (category) {
    case 'publish_eligible_today':
      return 'publishable_today'
    case 'address_gated':
    case 'address_enrichment_retryable':
      return 'blocked_by_enrichment'
    case 'address_enrichment_terminal':
      return 'blocked_by_other'
    case 'precision_gated':
      return 'blocked_by_precision'
    case 'geocode_blocked':
      return 'blocked_by_geocode'
    default:
      return 'blocked_by_other'
  }
}

export function collectFailureSignals(input: NeedsCheckClassificationInput): string[] {
  const signals: string[] = []
  if (hasGeocodeDeadLetter(input.failureDetails)) {
    signals.push('geocode_dead_letter')
  }
  if (hasAddressEnrichmentDetails(input.failureDetails)) {
    signals.push('address_enrichment_details')
  }

  for (const reason of toFailureReasonArray(input.failureReasons)) {
    signals.push(`failure_reason:${reason}`)
  }

  const root = readFailureDetailsObject(input.failureDetails)
  const dl = root?.geocode_dead_letter
  if (dl && typeof dl === 'object' && !Array.isArray(dl)) {
    const disposition = (dl as Record<string, unknown>).disposition
    if (typeof disposition === 'string') {
      signals.push(`geocode_disposition:${disposition}`)
    }
    const reasons = (dl as Record<string, unknown>).reasons
    if (Array.isArray(reasons)) {
      for (const reason of reasons) {
        if (typeof reason === 'string') {
          signals.push(`geocode_reason:${reason}`)
        }
      }
    }
  }

  const enrichment = root?.address_enrichment
  if (enrichment && typeof enrichment === 'object' && !Array.isArray(enrichment)) {
    const failureReason = (enrichment as Record<string, unknown>).failure_reason
    if (typeof failureReason === 'string') {
      signals.push(`enrichment_failure:${failureReason}`)
    }
  }

  return signals
}
