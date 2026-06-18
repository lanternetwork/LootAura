export const ADDRESS_STATUSES = [
  'address_available',
  'address_gated',
  'address_enrichment_pending',
  'address_enrichment_retry',
  'address_terminal_active',
  'address_terminal_archived',
] as const

export type AddressStatus = (typeof ADDRESS_STATUSES)[number]

export const ADDRESS_ENRICHMENT_FAILURE_REASONS = [
  'still_gated',
  'not_found',
  'fetch_blocked',
  'fetch_rate_limited',
  'fetch_failed',
  'parse_no_address',
  'max_attempts_exceeded',
] as const

export type AddressEnrichmentFailureReason = (typeof ADDRESS_ENRICHMENT_FAILURE_REASONS)[number]

export const MAX_ADDRESS_ENRICHMENT_ATTEMPTS = 5 as const
export const ADDRESS_NOT_FOUND_TERMINAL_THRESHOLD = 3 as const
