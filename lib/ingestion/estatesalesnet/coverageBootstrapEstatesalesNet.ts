import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { CoverageBootstrapDisabledReason, CoverageBootstrapState } from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'

/** Provider-scoped bootstrap key (shared columns from migration 208). */
export const COVERAGE_BOOTSTRAP_ESNET_STATE_KEY = 'coverage_bootstrap_estatesales_net'

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

export async function fetchEsnetCoverageBootstrapState(
  admin: ReturnType<typeof getAdminDb>
): Promise<CoverageBootstrapState> {
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select(
      'coverage_bootstrap_enabled, coverage_bootstrap_enabled_at, coverage_bootstrap_disabled_at, coverage_bootstrap_disabled_reason'
    )
    .eq('key', COVERAGE_BOOTSTRAP_ESNET_STATE_KEY)
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

export async function fetchEsnetCoverageBootstrapEnabled(
  admin: ReturnType<typeof getAdminDb>
): Promise<boolean> {
  const state = await fetchEsnetCoverageBootstrapState(admin)
  return state.enabled
}

export async function setEsnetCoverageBootstrapEnabled(
  admin: ReturnType<typeof getAdminDb>,
  params: { enabled: boolean; reason: CoverageBootstrapDisabledReason; at?: Date }
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
    .eq('key', COVERAGE_BOOTSTRAP_ESNET_STATE_KEY)
    .select(
      'coverage_bootstrap_enabled, coverage_bootstrap_enabled_at, coverage_bootstrap_disabled_at, coverage_bootstrap_disabled_reason'
    )
    .maybeSingle()

  if (updateError) {
    throw new Error(updateError.message)
  }

  if (!updated) {
    const insertRow: Record<string, unknown> = {
      key: COVERAGE_BOOTSTRAP_ESNET_STATE_KEY,
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
    const { error: insertError } = await fromBase(admin, 'ingestion_orchestration_state').insert(
      insertRow
    )
    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  return fetchEsnetCoverageBootstrapState(admin)
}
