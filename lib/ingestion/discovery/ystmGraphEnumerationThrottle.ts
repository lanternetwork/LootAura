export type YstmGraphEnumerationThrottleInput = {
  fetchAttempts: number
  fetchFailures: number
  blockedCount: number
  plannedValidations: number
}

export type YstmGraphEnumerationThrottleResult = {
  effectiveMaxValidations: number
  throttled: boolean
  reasons: string[]
}

const FETCH_FAILURE_RATE_THRESHOLD = 0.1
const BLOCK_RATE_THRESHOLD = 0.01

export function applyYstmGraphEnumerationThrottle(
  input: YstmGraphEnumerationThrottleInput
): YstmGraphEnumerationThrottleResult {
  const reasons: string[] = []
  let effective = input.plannedValidations
  let throttled = false

  if (input.fetchAttempts > 0) {
    const failureRate = input.fetchFailures / input.fetchAttempts
    if (failureRate > FETCH_FAILURE_RATE_THRESHOLD) {
      throttled = true
      reasons.push('fetch_failure_rate_high')
      effective = Math.max(1, Math.floor(effective * 0.5))
    }
    const blockRate = input.blockedCount / input.fetchAttempts
    if (blockRate > BLOCK_RATE_THRESHOLD) {
      throttled = true
      reasons.push('block_rate_high')
      effective = Math.max(1, Math.floor(effective * 0.5))
    }
  }

  return { effectiveMaxValidations: effective, throttled, reasons }
}
