export const ADDRESS_ENRICHMENT_PENDING_COHORT_CLASSIFICATIONS = [
  'waiting',
  'eligible_now',
  'stalled',
  'exhausted',
  'unclassified',
] as const

export type AddressEnrichmentPendingCohortClassification =
  (typeof ADDRESS_ENRICHMENT_PENDING_COHORT_CLASSIFICATIONS)[number]

export const ADDRESS_ENRICHMENT_FAILURE_SUBTYPES = [
  'parse_no_address',
  'still_gated',
  'not_found',
  'fetch_failure',
  'blocked_html',
  'captcha',
  'claim_ineligible',
  'never_attempted',
  'max_attempts_exceeded',
  'other',
] as const

export type AddressEnrichmentFailureSubtype = (typeof ADDRESS_ENRICHMENT_FAILURE_SUBTYPES)[number]

export type AddressEnrichmentDrainCohortRow = {
  id: string
  addressStatus: string | null
  coordinatePrecision: string | null
  status: string | null
  addressEnrichmentAttempts: number
  nextEnrichmentAttemptAt: string | null
  addressUnlockAt: string | null
  lastAddressEnrichmentAttemptAt: string | null
  addressEnrichmentFailureReason: string | null
  failureDetails: unknown
}

export type AddressEnrichmentDrainCohortAnalysis = {
  cohortKey: 'address_enrichment_pending_x_provider_native'
  total: number
  scanned: number
  byClassification: Record<AddressEnrichmentPendingCohortClassification, number>
  byFailureSubtype: Record<AddressEnrichmentFailureSubtype, number>
  dominantFailureSubtype: AddressEnrichmentFailureSubtype | null
}
