/**
 * Manual upload geocode retry reset (post–terminal geocode failure).
 * Lives outside route.ts because Next.js route modules only allow specific exports.
 */

import type { FailureReason } from '@/lib/ingestion/types'

export function stripGeocodeFailedFromFailureReasons(reasons: FailureReason[]): FailureReason[] {
  return reasons.filter((r) => r !== 'geocode_failed')
}

function priorFailureReasonsIncludeGeocodeFailed(reasons: unknown): boolean {
  if (!Array.isArray(reasons)) return false
  return reasons.some((x) => x === 'geocode_failed')
}

export function priorIndicatesTerminalGeocodeFailureForRetryReset(prior: {
  status: string | null
  failure_reasons: unknown
  geocode_attempts: number | null
}): boolean {
  if ((prior.geocode_attempts ?? 0) >= 3) return true
  if (prior.status === 'needs_check') return true
  return priorFailureReasonsIncludeGeocodeFailed(prior.failure_reasons)
}

export function shouldResetGeocodeRetryAfterUploadUpdate(params: {
  newStatus: string
  prior: { status: string | null; failure_reasons: unknown; geocode_attempts: number | null }
}): boolean {
  if (params.newStatus !== 'needs_geocode') return false
  return priorIndicatesTerminalGeocodeFailureForRetryReset(params.prior)
}
