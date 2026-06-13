import { YSTM_COVERAGE_AUDIT_STATE_KEY } from '@/lib/ingestion/ystmCoverage/ystmCoverageAuditConfig'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type CoverageTieredSchedulerState = {
  enabled: boolean
  enabledAt: string | null
  longTailCursor: number
  legacyCursor: number
}

type TieredSchedulerStateRow = {
  coverage_tiered_scheduler_enabled: boolean | null
  coverage_tiered_scheduler_enabled_at: string | null
  long_tail_cursor: number | null
  cursor: number | null
}

const TIERED_SCHEDULER_DISABLED_STATE: CoverageTieredSchedulerState = {
  enabled: false,
  enabledAt: null,
  longTailCursor: 0,
  legacyCursor: 0,
}

function combinedPostgrestErrorFields(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const e = error as { message?: unknown; details?: unknown; hint?: unknown }
  return [e.message, e.details, e.hint]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join('\n')
}

function postgrestErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

/** True when migration 218 columns are not yet on the connected database. */
export function isCoverageTieredSchedulerSchemaUnavailable(error: unknown): boolean {
  const text = combinedPostgrestErrorFields(error).toLowerCase()
  if (
    !text.includes('coverage_tiered_scheduler') &&
    !text.includes('long_tail_cursor')
  ) {
    return false
  }
  const code = postgrestErrorCode(error)
  if (code === 'PGRST204' || code === '42703' || code === 'PGRST301') {
    return true
  }
  return false
}

function parseStateRow(row: TieredSchedulerStateRow | null): CoverageTieredSchedulerState {
  return {
    enabled: row?.coverage_tiered_scheduler_enabled === true,
    enabledAt: row?.coverage_tiered_scheduler_enabled_at ?? null,
    longTailCursor: row?.long_tail_cursor ?? 0,
    legacyCursor: row?.cursor ?? 0,
  }
}

export async function fetchCoverageTieredSchedulerState(
  admin: ReturnType<typeof getAdminDb>
): Promise<CoverageTieredSchedulerState> {
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select(
      'coverage_tiered_scheduler_enabled, coverage_tiered_scheduler_enabled_at, long_tail_cursor, cursor'
    )
    .eq('key', YSTM_COVERAGE_AUDIT_STATE_KEY)
    .maybeSingle()

  if (error) {
    if (isCoverageTieredSchedulerSchemaUnavailable(error)) {
      logger.warn('coverage tiered scheduler state unavailable; treating as disabled', {
        component: 'ingestion/ystmCoverage/coverageTieredSchedulerMode',
        code: postgrestErrorCode(error),
      })
      return TIERED_SCHEDULER_DISABLED_STATE
    }
    throw new Error(error.message)
  }

  return parseStateRow(data as TieredSchedulerStateRow | null)
}

export async function fetchCoverageTieredSchedulerEnabled(
  admin: ReturnType<typeof getAdminDb>
): Promise<boolean> {
  if (process.env.YSTM_COVERAGE_TIERED_SCHEDULER === '1') {
    return true
  }
  if (process.env.YSTM_COVERAGE_TIERED_SCHEDULER === '0') {
    return false
  }
  const state = await fetchCoverageTieredSchedulerState(admin)
  return state.enabled
}

export async function setCoverageTieredSchedulerEnabled(
  admin: ReturnType<typeof getAdminDb>,
  params: { enabled: boolean; at?: Date }
): Promise<CoverageTieredSchedulerState> {
  const at = params.at ?? new Date()
  const iso = at.toISOString()
  const current = await fetchCoverageTieredSchedulerState(admin)

  const patch: Record<string, unknown> = {
    updated_at: iso,
  }

  if (params.enabled) {
    patch.coverage_tiered_scheduler_enabled = true
    patch.coverage_tiered_scheduler_enabled_at = iso
    if ((current.longTailCursor ?? 0) === 0 && (current.legacyCursor ?? 0) > 0) {
      patch.long_tail_cursor = current.legacyCursor
    }
  } else {
    patch.coverage_tiered_scheduler_enabled = false
    patch.coverage_tiered_scheduler_enabled_at = null
    patch.cursor = current.longTailCursor
  }

  const { data: updated, error: updateError } = await fromBase(admin, 'ingestion_orchestration_state')
    .update(patch)
    .eq('key', YSTM_COVERAGE_AUDIT_STATE_KEY)
    .select(
      'coverage_tiered_scheduler_enabled, coverage_tiered_scheduler_enabled_at, long_tail_cursor, cursor'
    )
    .maybeSingle()

  if (updateError) {
    throw new Error(updateError.message)
  }

  if (!updated) {
    const insertRow: Record<string, unknown> = {
      key: YSTM_COVERAGE_AUDIT_STATE_KEY,
      cursor: params.enabled ? 0 : 0,
      long_tail_cursor: 0,
      coverage_tiered_scheduler_enabled: params.enabled,
      updated_at: iso,
    }
    if (params.enabled) {
      insertRow.coverage_tiered_scheduler_enabled_at = iso
    }
    const { error: insertError } = await fromBase(admin, 'ingestion_orchestration_state').insert(insertRow)
    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  logger.info('Coverage tiered scheduler mode updated', {
    component: 'ingestion/ystmCoverage/coverageTieredSchedulerMode',
    enabled: params.enabled,
    cursorSyncedOnDisable: !params.enabled,
  })

  return fetchCoverageTieredSchedulerState(admin)
}
