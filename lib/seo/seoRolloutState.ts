import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const SEO_ROLLOUT_STATE_KEY = 'seo_rollout'

export type SeoRolloutAttestationTarget =
  | 'public_indexing'
  | 'crawl_validation'
  | 'search_console'

export type SeoRolloutRuntimeState = {
  publicIndexingEnabled: boolean
  publicIndexingEnabledAt: string | null
  publicIndexingDisabledAt: string | null
  crawlValidationPassed: boolean
  crawlValidationPassedAt: string | null
  searchConsoleValidationPassed: boolean
  searchConsoleValidationPassedAt: string | null
}

export const SEO_ROLLOUT_DISABLED_STATE: SeoRolloutRuntimeState = {
  publicIndexingEnabled: false,
  publicIndexingEnabledAt: null,
  publicIndexingDisabledAt: null,
  crawlValidationPassed: false,
  crawlValidationPassedAt: null,
  searchConsoleValidationPassed: false,
  searchConsoleValidationPassedAt: null,
}

type SeoRolloutStateRow = {
  seo_public_indexing_enabled: boolean | null
  seo_public_indexing_enabled_at: string | null
  seo_public_indexing_disabled_at: string | null
  seo_crawl_validation_passed: boolean | null
  seo_crawl_validation_passed_at: string | null
  seo_search_console_validation_passed: boolean | null
  seo_search_console_validation_passed_at: string | null
}

const SEO_ROLLOUT_SELECT =
  'seo_public_indexing_enabled, seo_public_indexing_enabled_at, seo_public_indexing_disabled_at, seo_crawl_validation_passed, seo_crawl_validation_passed_at, seo_search_console_validation_passed, seo_search_console_validation_passed_at'

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

/** True when migration 215 columns are not yet on the connected database. */
export function isSeoRolloutSchemaUnavailable(error: unknown): boolean {
  const text = combinedPostgrestErrorFields(error).toLowerCase()
  if (!text.includes('seo_public_indexing') && !text.includes('seo_crawl_validation')) {
    return false
  }
  const code = postgrestErrorCode(error)
  if (code === 'PGRST204' || code === '42703' || code === 'PGRST301') {
    return true
  }
  return false
}

function rowToSeoRolloutState(row: SeoRolloutStateRow | null): SeoRolloutRuntimeState {
  return {
    publicIndexingEnabled: row?.seo_public_indexing_enabled === true,
    publicIndexingEnabledAt: row?.seo_public_indexing_enabled_at ?? null,
    publicIndexingDisabledAt: row?.seo_public_indexing_disabled_at ?? null,
    crawlValidationPassed: row?.seo_crawl_validation_passed === true,
    crawlValidationPassedAt: row?.seo_crawl_validation_passed_at ?? null,
    searchConsoleValidationPassed: row?.seo_search_console_validation_passed === true,
    searchConsoleValidationPassedAt: row?.seo_search_console_validation_passed_at ?? null,
  }
}

export async function fetchSeoRolloutState(
  admin: ReturnType<typeof getAdminDb>
): Promise<SeoRolloutRuntimeState> {
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select(SEO_ROLLOUT_SELECT)
    .eq('key', SEO_ROLLOUT_STATE_KEY)
    .maybeSingle()

  if (error) {
    if (isSeoRolloutSchemaUnavailable(error)) {
      logger.warn('SEO rollout state unavailable; treating as disabled', {
        component: 'seo/seoRolloutState',
        code: postgrestErrorCode(error),
      })
      return SEO_ROLLOUT_DISABLED_STATE
    }
    throw new Error(error.message)
  }

  return rowToSeoRolloutState(data as SeoRolloutStateRow | null)
}

export async function setSeoRolloutAttestation(
  admin: ReturnType<typeof getAdminDb>,
  params: {
    target: SeoRolloutAttestationTarget
    enabled: boolean
    at?: Date
  }
): Promise<SeoRolloutRuntimeState> {
  const at = params.at ?? new Date()
  const iso = at.toISOString()
  const patch: Record<string, unknown> = { updated_at: iso }

  switch (params.target) {
    case 'public_indexing':
      patch.seo_public_indexing_enabled = params.enabled
      if (params.enabled) {
        patch.seo_public_indexing_enabled_at = iso
        patch.seo_public_indexing_disabled_at = null
      } else {
        patch.seo_public_indexing_disabled_at = iso
      }
      break
    case 'crawl_validation':
      patch.seo_crawl_validation_passed = params.enabled
      patch.seo_crawl_validation_passed_at = params.enabled ? iso : null
      break
    case 'search_console':
      patch.seo_search_console_validation_passed = params.enabled
      patch.seo_search_console_validation_passed_at = params.enabled ? iso : null
      break
    default: {
      const _exhaustive: never = params.target
      throw new Error(`Unknown SEO rollout target: ${String(_exhaustive)}`)
    }
  }

  const { data: updated, error: updateError } = await fromBase(admin, 'ingestion_orchestration_state')
    .update(patch)
    .eq('key', SEO_ROLLOUT_STATE_KEY)
    .select(SEO_ROLLOUT_SELECT)
    .maybeSingle()

  if (updateError) {
    throw new Error(updateError.message)
  }

  if (!updated) {
    const insertRow: Record<string, unknown> = {
      key: SEO_ROLLOUT_STATE_KEY,
      cursor: 0,
      updated_at: iso,
      ...patch,
    }
    if (params.target === 'public_indexing' && !params.enabled) {
      insertRow.seo_public_indexing_enabled = false
    }
    const { error: insertError } = await fromBase(admin, 'ingestion_orchestration_state').insert(insertRow)
    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  logger.info('SEO rollout attestation updated', {
    component: 'seo/seoRolloutState',
    target: params.target,
    enabled: params.enabled,
  })

  return fetchSeoRolloutState(admin)
}

export function isSeoIndexRolloutReady(state: SeoRolloutRuntimeState): boolean {
  return (
    state.publicIndexingEnabled &&
    state.crawlValidationPassed &&
    state.searchConsoleValidationPassed
  )
}
