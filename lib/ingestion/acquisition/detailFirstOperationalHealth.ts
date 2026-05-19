export type DetailFirstOperationalAlertLevel = 'warning' | 'critical'

export type DetailFirstOperationalAlert = {
  level: DetailFirstOperationalAlertLevel
  code: string
  message: string
}

export type DetailFirstOperationalHealth = {
  healthy: boolean
  alerts: DetailFirstOperationalAlert[]
}

export type DetailFirstOperationalHealthInput = {
  attempted: number
  succeeded: number
  published: number
  fallback: number
  fetchFailed: number
  freshInsertReadyAtInsertRate: number | null
  medianMsToPublished: number | null
  providerGeocodeBypassRate: number | null
  fallbackByReason: Record<string, number>
  topFallbackReason: string | null
  topFallbackReasonPct: number | null
  fallbackUnclassified: number
  fallbackReasonAccounted: number
  addressFromDetailPage: number
  addressFromListSeed: number
  addressFromDetailPageRate: number | null
}

/** Minimum detail-first attempts in the rollup window before SLO alerts fire. */
export const DETAIL_FIRST_SLO_MIN_ATTEMPTS = 20

/** Target from ≥90% ingestion plan: detail-first success rate floor. */
export const DETAIL_FIRST_SUCCESS_RATE_WARNING = 0.8

/** Detail address should dominate once the detail-native parser is live. */
export const DETAIL_FIRST_ADDRESS_FROM_DETAIL_WARNING = 0.5

/** address_validation_failed share of attempts when still elevated after parser work. */
export const DETAIL_FIRST_ADDRESS_VALIDATION_FAILED_WARNING = 0.05

export function evaluateDetailFirstOperationalHealth(
  metrics: DetailFirstOperationalHealthInput
): DetailFirstOperationalHealth {
  const alerts: DetailFirstOperationalAlert[] = []
  const attempted = metrics.attempted

  if (attempted < DETAIL_FIRST_SLO_MIN_ATTEMPTS) {
    return { healthy: true, alerts }
  }

  const successRate = metrics.providerGeocodeBypassRate
  if (successRate != null && successRate < DETAIL_FIRST_SUCCESS_RATE_WARNING) {
    alerts.push({
      level: 'critical',
      code: 'detail_first_success_rate_low',
      message: `Detail-first success rate ${(successRate * 100).toFixed(1)}% is below ${DETAIL_FIRST_SUCCESS_RATE_WARNING * 100}% (${metrics.succeeded}/${attempted} ready).`,
    })
  }

  const addressFromDetailRate = metrics.addressFromDetailPageRate
  if (
    addressFromDetailRate != null &&
    addressFromDetailRate < DETAIL_FIRST_ADDRESS_FROM_DETAIL_WARNING
  ) {
    alerts.push({
      level: 'warning',
      code: 'detail_first_address_from_list_seed_elevated',
      message: `Only ${(addressFromDetailRate * 100).toFixed(1)}% of detail-first attempts validated address from the detail page (${metrics.addressFromDetailPage}/${attempted}); list-seed address may still be driving validation.`,
    })
  }

  const addressValidationFailed = metrics.fallbackByReason.address_validation_failed ?? 0
  const addressValidationRate = addressValidationFailed / attempted
  if (addressValidationRate >= DETAIL_FIRST_ADDRESS_VALIDATION_FAILED_WARNING) {
    alerts.push({
      level: 'warning',
      code: 'detail_first_address_validation_failed_elevated',
      message: `address_validation_failed accounts for ${(addressValidationRate * 100).toFixed(1)}% of detail-first attempts (${addressValidationFailed}/${attempted}).`,
    })
  }

  if (metrics.fallbackUnclassified > 0) {
    alerts.push({
      level: metrics.fallbackUnclassified >= metrics.fallback ? 'critical' : 'warning',
      code: 'detail_first_fallback_unclassified',
      message: `${metrics.fallbackUnclassified} detail-first fallbacks lack a classified reason (${metrics.fallbackReasonAccounted}/${metrics.fallback} accounted).`,
    })
  }

  const hasCritical = alerts.some((a) => a.level === 'critical')
  return {
    healthy: alerts.length === 0,
    alerts,
  }
}
