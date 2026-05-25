import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { CoverageBootstrapDisabledReason } from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'

export const ESNET_INGEST_STATE_KEY = 'esnet_ingest_enabled'
export const ESNET_BOOTSTRAP_STATE_KEY = 'esnet_bootstrap_enabled'

/** Legacy bootstrap key from migration 209 (read fallback only). */
const LEGACY_ESNET_BOOTSTRAP_STATE_KEY = 'coverage_bootstrap_estatesales_net'

export type EsnetProviderDisabledReason = CoverageBootstrapDisabledReason

export type EsnetProviderRuntimeState = {
  enabled: boolean
  enabledAt: string | null
  disabledAt: string | null
  disabledReason: EsnetProviderDisabledReason | null
}

type IngestStateRow = {
  provider_ingest_enabled: boolean | null
  provider_ingest_enabled_at: string | null
  provider_ingest_disabled_at: string | null
  provider_ingest_disabled_reason: string | null
}

type BootstrapStateRow = {
  coverage_bootstrap_enabled: boolean | null
  coverage_bootstrap_enabled_at: string | null
  coverage_bootstrap_disabled_at: string | null
  coverage_bootstrap_disabled_reason: string | null
}

const DISABLED_STATE: EsnetProviderRuntimeState = {
  enabled: false,
  enabledAt: null,
  disabledAt: null,
  disabledReason: null,
}

function parseDisabledReason(raw: string | null): EsnetProviderDisabledReason | null {
  if (raw === 'admin' || raw === 'exit_criteria' || raw === 'fetch_pressure') {
    return raw
  }
  return null
}

function isProviderIngestSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const text = [(error as { message?: string }).message, (error as { details?: string }).details]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return text.includes('provider_ingest_enabled')
}

function rowToIngestState(row: IngestStateRow | null): EsnetProviderRuntimeState {
  return {
    enabled: row?.provider_ingest_enabled === true,
    enabledAt: row?.provider_ingest_enabled_at ?? null,
    disabledAt: row?.provider_ingest_disabled_at ?? null,
    disabledReason: parseDisabledReason(row?.provider_ingest_disabled_reason ?? null),
  }
}

function rowToBootstrapState(row: BootstrapStateRow | null): EsnetProviderRuntimeState {
  return {
    enabled: row?.coverage_bootstrap_enabled === true,
    enabledAt: row?.coverage_bootstrap_enabled_at ?? null,
    disabledAt: row?.coverage_bootstrap_disabled_at ?? null,
    disabledReason: parseDisabledReason(row?.coverage_bootstrap_disabled_reason ?? null),
  }
}

export async function fetchEsnetIngestState(
  admin: ReturnType<typeof getAdminDb>
): Promise<EsnetProviderRuntimeState> {
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select(
      'provider_ingest_enabled, provider_ingest_enabled_at, provider_ingest_disabled_at, provider_ingest_disabled_reason'
    )
    .eq('key', ESNET_INGEST_STATE_KEY)
    .maybeSingle()

  if (error) {
    if (isProviderIngestSchemaUnavailable(error)) {
      return DISABLED_STATE
    }
    throw new Error(error.message)
  }

  return rowToIngestState(data as IngestStateRow | null)
}

export async function fetchEsnetIngestEnabled(admin: ReturnType<typeof getAdminDb>): Promise<boolean> {
  const state = await fetchEsnetIngestState(admin)
  return state.enabled
}

export async function setEsnetIngestEnabled(
  admin: ReturnType<typeof getAdminDb>,
  params: { enabled: boolean; reason: EsnetProviderDisabledReason; at?: Date }
): Promise<EsnetProviderRuntimeState> {
  const at = params.at ?? new Date()
  const iso = at.toISOString()
  const patch: Record<string, unknown> = {
    provider_ingest_enabled: params.enabled,
    updated_at: iso,
  }
  if (params.enabled) {
    patch.provider_ingest_enabled_at = iso
    patch.provider_ingest_disabled_at = null
    patch.provider_ingest_disabled_reason = null
  } else {
    patch.provider_ingest_disabled_at = iso
    patch.provider_ingest_disabled_reason = params.reason
  }

  const { data: updated, error: updateError } = await fromBase(admin, 'ingestion_orchestration_state')
    .update(patch)
    .eq('key', ESNET_INGEST_STATE_KEY)
    .select(
      'provider_ingest_enabled, provider_ingest_enabled_at, provider_ingest_disabled_at, provider_ingest_disabled_reason'
    )
    .maybeSingle()

  if (updateError) {
    throw new Error(updateError.message)
  }

  if (!updated) {
    const insertRow: Record<string, unknown> = {
      key: ESNET_INGEST_STATE_KEY,
      cursor: 0,
      provider_ingest_enabled: params.enabled,
      updated_at: iso,
    }
    if (params.enabled) {
      insertRow.provider_ingest_enabled_at = iso
    } else {
      insertRow.provider_ingest_disabled_at = iso
      insertRow.provider_ingest_disabled_reason = params.reason
    }
    const { error: insertError } = await fromBase(admin, 'ingestion_orchestration_state').insert(insertRow)
    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  return fetchEsnetIngestState(admin)
}

async function readBootstrapRow(
  admin: ReturnType<typeof getAdminDb>,
  key: string
): Promise<BootstrapStateRow | null> {
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select(
      'coverage_bootstrap_enabled, coverage_bootstrap_enabled_at, coverage_bootstrap_disabled_at, coverage_bootstrap_disabled_reason'
    )
    .eq('key', key)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  return data as BootstrapStateRow | null
}

export async function fetchEsnetBootstrapState(
  admin: ReturnType<typeof getAdminDb>
): Promise<EsnetProviderRuntimeState> {
  const canonical = await readBootstrapRow(admin, ESNET_BOOTSTRAP_STATE_KEY)
  if (canonical?.coverage_bootstrap_enabled === true || canonical?.coverage_bootstrap_enabled_at) {
    return rowToBootstrapState(canonical)
  }

  const legacy = await readBootstrapRow(admin, LEGACY_ESNET_BOOTSTRAP_STATE_KEY)
  return rowToBootstrapState(legacy)
}

export async function fetchEsnetBootstrapEnabled(admin: ReturnType<typeof getAdminDb>): Promise<boolean> {
  const state = await fetchEsnetBootstrapState(admin)
  return state.enabled
}

export async function setEsnetBootstrapEnabled(
  admin: ReturnType<typeof getAdminDb>,
  params: { enabled: boolean; reason: EsnetProviderDisabledReason; at?: Date }
): Promise<EsnetProviderRuntimeState> {
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
    .eq('key', ESNET_BOOTSTRAP_STATE_KEY)
    .select(
      'coverage_bootstrap_enabled, coverage_bootstrap_enabled_at, coverage_bootstrap_disabled_at, coverage_bootstrap_disabled_reason'
    )
    .maybeSingle()

  if (updateError) {
    throw new Error(updateError.message)
  }

  if (!updated) {
    const insertRow: Record<string, unknown> = {
      key: ESNET_BOOTSTRAP_STATE_KEY,
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

  return fetchEsnetBootstrapState(admin)
}

/** Lane cursor + last_completed_at for ES.net ingest cadence (not YSTM external_page_source). */
export const ESNET_INGEST_LANE_STATE_KEY = 'esnet_ingest_lane'

export async function fetchEsnetIngestLaneLastCompletedAt(
  admin: ReturnType<typeof getAdminDb>
): Promise<string | null> {
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select('last_completed_at')
    .eq('key', ESNET_INGEST_LANE_STATE_KEY)
    .maybeSingle()

  if (error) {
    return null
  }
  const row = data as { last_completed_at?: string | null } | null
  return row?.last_completed_at ?? null
}

export async function touchEsnetIngestLaneCompleted(
  admin: ReturnType<typeof getAdminDb>,
  at: Date = new Date()
): Promise<void> {
  const iso = at.toISOString()
  const { data: existing } = await fromBase(admin, 'ingestion_orchestration_state')
    .select('key')
    .eq('key', ESNET_INGEST_LANE_STATE_KEY)
    .maybeSingle()

  if (existing) {
    await fromBase(admin, 'ingestion_orchestration_state')
      .update({ last_completed_at: iso, updated_at: iso })
      .eq('key', ESNET_INGEST_LANE_STATE_KEY)
    return
  }

  await fromBase(admin, 'ingestion_orchestration_state').insert({
    key: ESNET_INGEST_LANE_STATE_KEY,
    cursor: 0,
    last_completed_at: iso,
    updated_at: iso,
  })
}
