/** Comparable listing eligibility for DISCOVERY_FRESHNESS_PROGRAM_V2 denominators. */

export type ComparableListingObservationRow = {
  ystmValidActive: boolean
  falseExclusionPrimaryBucket: string | null
  ystmInvalidReason: string | null
}

const TERMINAL_ADDRESS_BUCKETS = new Set([
  'address_unavailable_terminal',
  'address_terminal_active',
  'address_terminal_archived',
  'address_validation_failed_terminal',
])

export function isComparableYstmListingObservation(row: ComparableListingObservationRow): boolean {
  if (!row.ystmValidActive) return false
  if (row.ystmInvalidReason === 'expired') return false
  const bucket = row.falseExclusionPrimaryBucket?.trim()
  if (bucket && TERMINAL_ADDRESS_BUCKETS.has(bucket)) return false
  return true
}

export function isDiscoveryLatencyProxyOnly(appearanceSource: string | null | undefined): boolean {
  return appearanceSource?.trim() === 'observation_proxy'
}
