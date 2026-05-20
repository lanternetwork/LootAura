import {
  DETAIL_FIRST_ADDRESS_VALIDATION_FAILED_WARNING,
  DETAIL_FIRST_SLO_MIN_ATTEMPTS,
  DETAIL_FIRST_SUCCESS_RATE_TARGET,
  type DetailFirstOperationalHealthInput,
} from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

/** Post-baseline proof: insert_failed share of attempts must stay below this. */
export const DETAIL_FIRST_PROOF_INSERT_FAILED_MAX = 0.02

export type DetailFirstProofStatus =
  | 'pending_baseline'
  | 'collecting'
  | 'pass'
  | 'fail'

export type DetailFirstProofCheckId =
  | 'metrics_baseline_set'
  | 'min_attempts'
  | 'success_rate'
  | 'address_validation_failed'
  | 'insert_failed'
  | 'fallback_accounted'

export type DetailFirstProofCheck = {
  id: DetailFirstProofCheckId
  label: string
  pass: boolean
  /** When false, failure does not block proof pass (advisory only). */
  required: boolean
  actual: string
  threshold: string
}

export type DetailFirstProofEvaluation = {
  status: DetailFirstProofStatus
  passed: boolean
  baselineAt: string | null
  /** Human-readable rollup window for proof (post-baseline 24h funnel). */
  windowLabel: string
  checks: DetailFirstProofCheck[]
  summary: string
}

export type EvaluateDetailFirstProofInput = {
  metricsBaselineAt: string | null
  detailFirst: DetailFirstOperationalHealthInput & {
    insertFailedByDbCode?: Record<string, number>
  }
}

function formatPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function formatPctFloor(target: number): string {
  return `≥${(target * 100).toFixed(0)}%`
}

function formatPctCeil(max: number): string {
  return `<${(max * 100).toFixed(0)}%`
}

export function evaluateDetailFirstProofProtocol(
  input: EvaluateDetailFirstProofInput
): DetailFirstProofEvaluation {
  const { metricsBaselineAt, detailFirst: metrics } = input
  const attempted = metrics.attempted
  const baselineAt = metricsBaselineAt
  const windowLabel = baselineAt
    ? `24h funnel cohort on/after ${baselineAt}`
    : '24h funnel (pre-baseline rows included until reset)'

  const successRate = metrics.providerGeocodeBypassRate
  const addressValidationFailed = metrics.fallbackByReason.address_validation_failed ?? 0
  const addressValidationRate = attempted > 0 ? addressValidationFailed / attempted : null
  const insertFailedCount = metrics.fallbackByReason.insert_failed ?? 0
  const insertFailedRate = attempted > 0 ? insertFailedCount / attempted : null

  const canJudgeSlo =
    baselineAt != null && attempted >= DETAIL_FIRST_SLO_MIN_ATTEMPTS

  const checks: DetailFirstProofCheck[] = [
    {
      id: 'metrics_baseline_set',
      label: 'Metrics baseline reset',
      required: true,
      pass: baselineAt != null,
      actual: baselineAt ?? 'not set',
      threshold: 'set once after deploy',
    },
    {
      id: 'min_attempts',
      label: 'Post-baseline sample size',
      required: true,
      pass: attempted >= DETAIL_FIRST_SLO_MIN_ATTEMPTS,
      actual: `${attempted} detail-first attempts`,
      threshold: `≥${DETAIL_FIRST_SLO_MIN_ATTEMPTS}`,
    },
    {
      id: 'success_rate',
      label: 'Detail-first success rate',
      required: true,
      pass:
        canJudgeSlo &&
        successRate != null &&
        successRate >= DETAIL_FIRST_SUCCESS_RATE_TARGET,
      actual: !baselineAt
        ? 'awaiting baseline reset'
        : !canJudgeSlo
          ? `${attempted}/${DETAIL_FIRST_SLO_MIN_ATTEMPTS} attempts`
          : `${formatPct(successRate)} (${metrics.succeeded}/${attempted} ready)`,
      threshold: formatPctFloor(DETAIL_FIRST_SUCCESS_RATE_TARGET),
    },
    {
      id: 'address_validation_failed',
      label: 'address_validation_failed',
      required: true,
      pass:
        canJudgeSlo &&
        addressValidationRate != null &&
        addressValidationRate < DETAIL_FIRST_ADDRESS_VALIDATION_FAILED_WARNING,
      actual: !baselineAt
        ? 'awaiting baseline reset'
        : !canJudgeSlo
          ? `${attempted}/${DETAIL_FIRST_SLO_MIN_ATTEMPTS} attempts`
          : `${formatPct(addressValidationRate)} (${addressValidationFailed}/${attempted})`,
      threshold: formatPctCeil(DETAIL_FIRST_ADDRESS_VALIDATION_FAILED_WARNING),
    },
    {
      id: 'insert_failed',
      label: 'insert_failed',
      required: true,
      pass:
        canJudgeSlo &&
        insertFailedRate != null &&
        insertFailedRate < DETAIL_FIRST_PROOF_INSERT_FAILED_MAX,
      actual: !baselineAt
        ? 'awaiting baseline reset'
        : !canJudgeSlo
          ? `${attempted}/${DETAIL_FIRST_SLO_MIN_ATTEMPTS} attempts`
          : `${formatPct(insertFailedRate)} (${insertFailedCount}/${attempted})`,
      threshold: formatPctCeil(DETAIL_FIRST_PROOF_INSERT_FAILED_MAX),
    },
    {
      id: 'fallback_accounted',
      label: 'Fallback reasons accounted',
      required: false,
      pass:
        metrics.fallback === 0 ||
        metrics.fallbackUnclassified === 0,
      actual:
        metrics.fallback === 0
          ? 'no fallbacks'
          : `${metrics.fallbackReasonAccounted}/${metrics.fallback} accounted`,
      threshold: '100% when fallback > 0',
    },
  ]

  let status: DetailFirstProofStatus
  if (!baselineAt) {
    status = 'pending_baseline'
  } else if (attempted < DETAIL_FIRST_SLO_MIN_ATTEMPTS) {
    status = 'collecting'
  } else if (checks.filter((c) => c.required).every((c) => c.pass)) {
    status = 'pass'
  } else {
    status = 'fail'
  }

  const passed = status === 'pass'

  let summary: string
  switch (status) {
    case 'pending_baseline':
      summary =
        'Reset the ingestion metrics window once after deploy, then run crawls before judging the ≥90% SLO.'
      break
    case 'collecting':
      summary = `Collecting post-baseline volume (${attempted}/${DETAIL_FIRST_SLO_MIN_ATTEMPTS} detail-first attempts in 24h rollup).`
      break
    case 'pass':
      summary = `Post-baseline proof passed on ${windowLabel}.`
      break
    case 'fail':
      summary = `Post-baseline proof failed on ${windowLabel}; see checklist for gaps.`
      break
  }

  return {
    status,
    passed,
    baselineAt,
    windowLabel,
    checks,
    summary,
  }
}
