import { createHash } from 'node:crypto'
import {
  canonicalDateWindow,
  computeSourceLocationHash,
  normalizeLocationBucket,
} from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import { computeScheduleHash } from '@/lib/reconciliation/sourceHashing'

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export type ComputeCanonicalSaleInstanceKeyInput = {
  state: string | null
  city: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  timeStart?: string | null
  timeEnd?: string | null
  lat?: number | null
  lng?: number | null
  /** When present (from identity row), preferred over recomputing schedule fingerprint. */
  sourceScheduleHash?: string | null
  /** When present (from identity row), preferred over recomputing location fingerprint. */
  sourceLocationHash?: string | null
}

/**
 * Cross-provider sale event key (platform-agnostic).
 * Used for convergence grouping and Phase A telemetry only — not ingest/publish enforcement yet.
 */
export function computeCanonicalSaleInstanceKey(
  input: ComputeCanonicalSaleInstanceKeyInput
): string | null {
  const normalizedAddress = input.normalizedAddress?.trim() ?? ''
  const dateStart = input.dateStart?.trim() ?? ''
  if (!normalizedAddress || !dateStart) {
    return null
  }

  const normalizedLocationBucket = normalizeLocationBucket({
    state: input.state,
    city: input.city,
    normalizedAddress: input.normalizedAddress,
  })
  const canonicalDateWindowValue = canonicalDateWindow(input.dateStart, input.dateEnd)

  const scheduleFingerprint =
    input.sourceScheduleHash?.trim() ||
    computeScheduleHash({
      dateStart: input.dateStart,
      dateEnd: input.dateEnd,
      timeStart: input.timeStart ?? null,
      timeEnd: input.timeEnd ?? null,
      listingTimezone: null,
      descriptionScheduleAux: null,
    })

  const locationFingerprint =
    input.sourceLocationHash?.trim() ||
    computeSourceLocationHash({
      state: input.state,
      city: input.city,
      normalizedAddress: input.normalizedAddress,
      lat: input.lat,
      lng: input.lng,
    })

  return sha256Hex(
    JSON.stringify({
      normalized_location_bucket: normalizedLocationBucket,
      canonical_date_window: canonicalDateWindowValue,
      schedule_fingerprint: scheduleFingerprint,
      location_fingerprint: locationFingerprint,
    })
  )
}

export function canonicalKeyFromSaleInstanceIdentity(input: {
  state: string | null
  city: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  timeStart?: string | null
  timeEnd?: string | null
  lat?: number | null
  lng?: number | null
  sourceScheduleHash: string | null
  sourceLocationHash: string | null
}): string | null {
  return computeCanonicalSaleInstanceKey({
    state: input.state,
    city: input.city,
    normalizedAddress: input.normalizedAddress,
    dateStart: input.dateStart,
    dateEnd: input.dateEnd,
    timeStart: input.timeStart,
    timeEnd: input.timeEnd,
    lat: input.lat,
    lng: input.lng,
    sourceScheduleHash: input.sourceScheduleHash,
    sourceLocationHash: input.sourceLocationHash,
  })
}
