import type { DiscoveryValidationResult } from '@/lib/ingestion/discovery/sourceDiscoveryValidator'

export const YSTM_SOURCE_PAGE_CANDIDATE_STATUS = {
  pending: 'pending',
  validated: 'validated',
  invalidShell: 'invalid_shell',
  blocked: 'blocked',
  fetchFailed: 'fetch_failed',
  emptyList: 'empty_list',
  nonCityPage: 'non_city_page',
  notFound: 'not_found',
} as const

export type YstmSourcePageCandidateStatus =
  (typeof YSTM_SOURCE_PAGE_CANDIDATE_STATUS)[keyof typeof YSTM_SOURCE_PAGE_CANDIDATE_STATUS]

export function mapDiscoveryValidationToCandidateStatus(
  validation: DiscoveryValidationResult
): { status: YstmSourcePageCandidateStatus; failureReason: string | null } {
  if (validation.ok) {
    return { status: YSTM_SOURCE_PAGE_CANDIDATE_STATUS.validated, failureReason: null }
  }
  const reason = validation.reason
  if (reason === 'state_shell_not_city_page') {
    return { status: YSTM_SOURCE_PAGE_CANDIDATE_STATUS.invalidShell, failureReason: reason }
  }
  if (reason === 'empty_page_missing_valid_empty_signals') {
    return { status: YSTM_SOURCE_PAGE_CANDIDATE_STATUS.emptyList, failureReason: reason }
  }
  if (/not_found|http_error:\s*404/i.test(reason)) {
    return { status: YSTM_SOURCE_PAGE_CANDIDATE_STATUS.notFound, failureReason: reason }
  }
  if (/block|captcha|forbidden|429/i.test(reason)) {
    return { status: YSTM_SOURCE_PAGE_CANDIDATE_STATUS.blocked, failureReason: reason }
  }
  return { status: YSTM_SOURCE_PAGE_CANDIDATE_STATUS.nonCityPage, failureReason: reason }
}

export function mapFetchErrorToCandidateStatus(message: string): {
  status: YstmSourcePageCandidateStatus
  failureReason: string
} {
  if (/http_error:\s*404/i.test(message)) {
    return { status: YSTM_SOURCE_PAGE_CANDIDATE_STATUS.notFound, failureReason: message }
  }
  if (/block|captcha|forbidden|429|rate/i.test(message)) {
    return { status: YSTM_SOURCE_PAGE_CANDIDATE_STATUS.blocked, failureReason: message }
  }
  return { status: YSTM_SOURCE_PAGE_CANDIDATE_STATUS.fetchFailed, failureReason: message }
}
