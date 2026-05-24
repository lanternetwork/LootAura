import { YSTM_COVERAGE_TARGET_PCT } from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'
import {
  COVERAGE_BOOTSTRAP_EXIT_MIN_VALID_ACTIVE_URLS,
  COVERAGE_BOOTSTRAP_MIN_ENABLED_HOURS,
} from '@/lib/ingestion/ystmCoverage/coverageBudgetProfiles'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const COVERAGE_BOOTSTRAP_STATE_KEY = 'coverage_bootstrap_nationwide'

export type CoverageBootstrapDisabledReason = 'admin' | 'exit_criteria' | 'fetch_pressure'

export type CoverageBootstrapState = {
  enabled: boolean
  enabledAt: string | null
  disabledAt: string | null
  disabledReason: CoverageBootstrapDisabledReason | null
}

export type CoverageBootstrapExitCriteriaSnapshot = {
  coveragePct: number | null
  missingValidYstmUrls: number
  validActiveYstmUrls: number
  catalogRepairQueue: number
  fetchFailureRate24h: number | null
  blockRate24h: number | null
  enabledAt: string | null
  nowMs?: number
}

export type CoverageBootstrapExitEvaluation = {
  met: boolean
  reasons: string[]
}

type BootstrapStateRow = {
  coverage_bootstrap_enabled: boolean | null
  coverage_bootstrap_enabled_at: string | null
  coverage_bootstrap_disabled_at: string | null
  coverage_bootstrap_disabled_reason: string | null
}

function parseDisabledReason(raw: string | null): CoverageBootstrapDisabledReason | null {
  if (raw === 'admin' || raw === 'exit_criteria' || raw === 'fetch_pressure') {
    return raw
  }
  return null
}

export async function fetchCoverageBootstrapState(
  admin: ReturnType<typeof getAdminDb>
): Promise<CoverageBootstrapState> {
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select(
      'coverage_bootstrap_enabled, coverage_bootstrap_enabled_at, coverage_bootstrap_disabled_at, coverage_bootstrap_disabled_reason'
    )
    .eq('key', COVERAGE_BOOTSTRAP_STATE_KEY)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const row = data as BootstrapStateRow | null
  return {
    enabled: row?.coverage_bootstrap_enabled === true,
    enabledAt: row?.coverage_bootstrap_enabled_at ?? null,
    disabledAt: row?.coverage_bootstrap_disabled_at ?? null,
    disabledReason: parseDisabledReason(row?.coverage_bootstrap_disabled_reason ?? null),
  }
}

export async function fetchCoverageBootstrapEnabled(
  admin: ReturnType<typeof getAdminDb>
): Promise<boolean> {
  const state = await fetchCoverageBootstrapState(admin)
  return state.enabled
}

export async function setCoverageBootstrapEnabled(
  admin: ReturnType<typeof getAdminDb>,
  params: {
    enabled: boolean
    reason: CoverageBootstrapDisabledReason
    at?: Date
  }
): Promise<CoverageBootstrapState> {
  const at = params.at ?? new Date()
  const iso = at.toISOString()
  const patch: Record<string, unknown> = {
    coverage_bootstrap_enabled: params.enabled,
    updated_at: iso,
  }

  if (params.enabled) {
    patch.coverage_bootstrap_enabled_at = iso
    patch.coverage_bootstrap_disabled_at = null
    patch.coverage_bootstrap_disabled_reason = null
  } else {
    patch.coverage_bootstrap_disabled_at = iso
    patch.coverage_bootstrap_disabled_reason = params.reason
  }

  const { data: updated, error: updateError } = await fromBase(admin, 'ingestion_orchestration_state')
    .update(patch)
    .eq('key', COVERAGE_BOOTSTRAP_STATE_KEY)
    .select(
      'coverage_bootstrap_enabled, coverage_bootstrap_enabled_at, coverage_bootstrap_disabled_at, coverage_bootstrap_disabled_reason'
    )
    .maybeSingle()

  if (updateError) {
    throw new Error(updateError.message)
  }

  if (!updated) {
    const insertRow: Record<string, unknown> = {
      key: COVERAGE_BOOTSTRAP_STATE_KEY,
      cursor: 0,
      coverage_bootstrap_enabled: params.enabled,
      updated_at: iso,
    }
    if (params.enabled) {
      insertRow.coverage_bootstrap_enabled_at = iso
    } else {
      insertRow.coverage_bootstrap_disabled_at = iso
      insertRow.coverage_bootstrap_disabled_reason = params.reason
    }
    const { error: insertError } = await fromBase(admin, 'ingestion_orchestration_state').insert(insertRow)
    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  logger.info('Coverage bootstrap nationwide mode updated', {
    component: 'ingestion/ystmCoverage/coverageBootstrapNationwideMode',
    enabled: params.enabled,
    reason: params.reason,
  })

  return fetchCoverageBootstrapState(admin)
}

export function evaluateCoverageBootstrapExitCriteria(
  snapshot: CoverageBootstrapExitCriteriaSnapshot
): CoverageBootstrapExitEvaluation {
  const nowMs = snapshot.nowMs ?? Date.now()
  const reasons: string[] = []

  if (snapshot.coveragePct == null || snapshot.coveragePct < YSTM_COVERAGE_TARGET_PCT) {
    reasons.push(`coveragePct ${snapshot.coveragePct ?? 'null'} < ${YSTM_COVERAGE_TARGET_PCT}`)
  }
  if (snapshot.missingValidYstmUrls > 25) {
    reasons.push(`missingValidYstmUrls ${snapshot.missingValidYstmUrls} > 25`)
  }
  if (snapshot.catalogRepairQueue >= 50) {
    reasons.push(`catalogRepairQueue ${snapshot.catalogRepairQueue} >= 50`)
  }
  if (snapshot.validActiveYstmUrls < COVERAGE_BOOTSTRAP_EXIT_MIN_VALID_ACTIVE_URLS) {
    reasons.push(
      `validActiveYstmUrls ${snapshot.validActiveYstmUrls} < ${COVERAGE_BOOTSTRAP_EXIT_MIN_VALID_ACTIVE_URLS}`
    )
  }
  if (snapshot.fetchFailureRate24h != null && snapshot.fetchFailureRate24h > 2) {
    reasons.push(`fetchFailureRate24h ${snapshot.fetchFailureRate24h}% > 2%`)
  }
  if (snapshot.blockRate24h != null && snapshot.blockRate24h > 2) {
    reasons.push(`blockRate24h ${snapshot.blockRate24h}% > 2%`)
  }

  const enabledAtMs = snapshot.enabledAt ? Date.parse(snapshot.enabledAt) : Number.NaN
  if (!Number.isFinite(enabledAtMs)) {
    reasons.push('bootstrap enabledAt missing')
  } else {
    const enabledHours = (nowMs - enabledAtMs) / (60 * 60 * 1000)
    if (enabledHours < COVERAGE_BOOTSTRAP_MIN_ENABLED_HOURS) {
      reasons.push(
        `bootstrap enabled ${enabledHours.toFixed(1)}h < ${COVERAGE_BOOTSTRAP_MIN_ENABLED_HOURS}h minimum`
      )
    }
  }

  return { met: reasons.length === 0, reasons }
}

export function evaluateCoverageBootstrapFetchPressureDisable(
  fetchFailureRate24h: number | null
): boolean {
  return fetchFailureRate24h != null && fetchFailureRate24h > 5
}

export async function maybeAutoDisableCoverageBootstrap(
  admin: ReturnType<typeof getAdminDb>,
  snapshot: CoverageBootstrapExitCriteriaSnapshot
): Promise<{ disabled: boolean; reasons: string[] }> {
  const state = await fetchCoverageBootstrapState(admin)
  if (!state.enabled) {
    return { disabled: false, reasons: [] }
  }

  const nowMs = snapshot.nowMs ?? Date.now()

  if (evaluateCoverageBootstrapFetchPressureDisable(snapshot.fetchFailureRate24h)) {
    await setCoverageBootstrapEnabled(admin, {
      enabled: false,
      reason: 'fetch_pressure',
      at: new Date(nowMs),
    })
    return { disabled: true, reasons: ['fetchFailureRate24h > 5%'] }
  }

  const evaluation = evaluateCoverageBootstrapExitCriteria({
    ...snapshot,
    enabledAt: state.enabledAt,
    nowMs,
  })

  if (!evaluation.met) {
    return { disabled: false, reasons: evaluation.reasons }
  }

  await setCoverageBootstrapEnabled(admin, {
    enabled: false,
    reason: 'exit_criteria',
    at: new Date(nowMs),
  })

  return { disabled: true, reasons: evaluation.reasons }
}
