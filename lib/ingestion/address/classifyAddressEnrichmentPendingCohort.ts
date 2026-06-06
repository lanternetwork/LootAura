import {
  MAX_ADDRESS_ENRICHMENT_ATTEMPTS,
  type AddressEnrichmentFailureReason,
} from '@/lib/ingestion/address/addressLifecycleTypes'
import type {
  AddressEnrichmentDrainCohortRow,
  AddressEnrichmentFailureSubtype,
  AddressEnrichmentPendingCohortClassification,
} from '@/lib/ingestion/address/addressEnrichmentDrainTypes'

export const DEFAULT_ADDRESS_ENRICHMENT_CLAIM_COOLDOWN_MINUTES = 15 as const

const CLAIM_STATUSES = new Set([
  'address_gated',
  'address_enrichment_pending',
  'address_enrichment_retry',
])

export type AddressEnrichmentClaimEligibility = {
  claimable: boolean
  skipReason:
    | 'wrong_status'
    | 'attempts_exhausted'
    | 'next_attempt_scheduled'
    | 'unlock_scheduled'
    | 'cooldown_active'
    | null
}

function readTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function readEnrichmentLastReason(failureDetails: unknown): string | null {
  if (!failureDetails || typeof failureDetails !== 'object' || Array.isArray(failureDetails)) {
    return null
  }
  const section = (failureDetails as Record<string, unknown>).address_enrichment
  if (!section || typeof section !== 'object' || Array.isArray(section)) return null
  const lastReason = (section as Record<string, unknown>).lastReason
  return typeof lastReason === 'string' ? lastReason : null
}

export function evaluateAddressEnrichmentClaimEligibility(
  row: Pick<
    AddressEnrichmentDrainCohortRow,
    | 'addressStatus'
    | 'addressEnrichmentAttempts'
    | 'nextEnrichmentAttemptAt'
    | 'addressUnlockAt'
    | 'lastAddressEnrichmentAttemptAt'
  >,
  nowMs: number,
  cooldownMinutes = DEFAULT_ADDRESS_ENRICHMENT_CLAIM_COOLDOWN_MINUTES
): AddressEnrichmentClaimEligibility {
  const status = row.addressStatus ?? ''
  if (!CLAIM_STATUSES.has(status)) {
    return { claimable: false, skipReason: 'wrong_status' }
  }
  if (row.addressEnrichmentAttempts >= MAX_ADDRESS_ENRICHMENT_ATTEMPTS) {
    return { claimable: false, skipReason: 'attempts_exhausted' }
  }

  const nextAttemptMs = readTimestampMs(row.nextEnrichmentAttemptAt)
  if (nextAttemptMs != null && nextAttemptMs > nowMs) {
    return { claimable: false, skipReason: 'next_attempt_scheduled' }
  }

  const unlockMs = readTimestampMs(row.addressUnlockAt)
  if (unlockMs != null && unlockMs > nowMs) {
    return { claimable: false, skipReason: 'unlock_scheduled' }
  }

  const lastAttemptMs = readTimestampMs(row.lastAddressEnrichmentAttemptAt)
  if (lastAttemptMs != null) {
    const cooldownMs = cooldownMinutes * 60 * 1000
    if (nowMs - lastAttemptMs < cooldownMs) {
      return { claimable: false, skipReason: 'cooldown_active' }
    }
  }

  return { claimable: true, skipReason: null }
}

export function mapAddressEnrichmentFailureSubtype(input: {
  addressEnrichmentFailureReason: string | null
  failureDetails: unknown
  addressEnrichmentAttempts: number
  claimable: boolean
}): AddressEnrichmentFailureSubtype {
  if (input.addressEnrichmentAttempts === 0 && !readEnrichmentLastReason(input.failureDetails)) {
    return 'never_attempted'
  }
  if (input.addressEnrichmentAttempts >= MAX_ADDRESS_ENRICHMENT_ATTEMPTS) {
    return 'max_attempts_exceeded'
  }
  if (!input.claimable && input.addressEnrichmentAttempts < MAX_ADDRESS_ENRICHMENT_ATTEMPTS) {
    return 'claim_ineligible'
  }

  const reason =
    input.addressEnrichmentFailureReason ?? readEnrichmentLastReason(input.failureDetails) ?? ''

  switch (reason as AddressEnrichmentFailureReason | string) {
    case 'parse_no_address':
      return 'parse_no_address'
    case 'still_gated':
      return 'still_gated'
    case 'not_found':
      return 'not_found'
    case 'fetch_failed':
      return 'fetch_failure'
    case 'fetch_rate_limited':
      return 'fetch_failure'
    case 'fetch_blocked':
      return 'blocked_html'
    case 'max_attempts_exceeded':
      return 'max_attempts_exceeded'
    default:
      if (/captcha/i.test(reason)) return 'captcha'
      return reason ? 'other' : 'never_attempted'
  }
}

export function classifyAddressEnrichmentPendingCohortRow(
  row: AddressEnrichmentDrainCohortRow,
  nowMs: number,
  cooldownMinutes = DEFAULT_ADDRESS_ENRICHMENT_CLAIM_COOLDOWN_MINUTES
): AddressEnrichmentPendingCohortClassification {
  if (row.addressEnrichmentAttempts >= MAX_ADDRESS_ENRICHMENT_ATTEMPTS) {
    return 'exhausted'
  }

  const eligibility = evaluateAddressEnrichmentClaimEligibility(row, nowMs, cooldownMinutes)
  if (!eligibility.claimable) {
    return 'waiting'
  }

  const hasAttemptHistory =
    row.addressEnrichmentAttempts > 0 || readEnrichmentLastReason(row.failureDetails) != null

  if (hasAttemptHistory) {
    return 'stalled'
  }

  return 'eligible_now'
}

export function isAddressEnrichmentDrainCohortRow(row: {
  status: string | null
  addressStatus: string | null
  coordinatePrecision: string | null
}): boolean {
  return (
    row.status === 'needs_check' &&
    row.addressStatus === 'address_enrichment_pending' &&
    row.coordinatePrecision === 'provider_native'
  )
}
