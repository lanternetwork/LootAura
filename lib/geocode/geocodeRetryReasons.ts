import type { GeocodeNoCoordsReason } from '@/lib/geocode/geocodeAddress'

export const GEOCODE_STRUCTURED_RETRY_REASONS = [
  'provider_empty_results',
  'provider_timeout',
  'provider_rate_limited',
  'malformed_address',
  'low_confidence_match',
  'broad_locality_match',
  'variant_budget_exhausted',
] as const

export type GeocodeStructuredRetryReason = (typeof GEOCODE_STRUCTURED_RETRY_REASONS)[number]

export function structuredReasonFromGeocodeOutcome(input: {
  noCoordsReason?: GeocodeNoCoordsReason | string | null
  hit429?: boolean
  providerClassification?: string | null
  lowConfidenceReasons?: string[] | null
  malformedAddress?: boolean
  variantBudgetExhausted?: boolean
}): GeocodeStructuredRetryReason {
  if (input.malformedAddress) return 'malformed_address'
  if (input.variantBudgetExhausted) return 'variant_budget_exhausted'
  if (input.hit429) return 'provider_rate_limited'
  const n = (input.noCoordsReason ?? '').trim()
  const p = (input.providerClassification ?? '').trim()
  if (n === 'fetch_exception' || p === 'fetch_exception') return 'provider_timeout'
  if (n === 'rate_limited' || n === 'rate_limited_soft' || p.includes('rate_limited')) {
    return 'provider_rate_limited'
  }
  if (n === 'empty_results' || p === 'empty_results') return 'provider_empty_results'
  if (n === 'low_confidence' || p === 'low_confidence') {
    if (input.lowConfidenceReasons?.includes('broad_match')) return 'broad_locality_match'
    return 'low_confidence_match'
  }
  return 'provider_empty_results'
}
