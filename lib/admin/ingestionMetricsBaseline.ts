import { fromBase, getAdminDb } from '@/lib/supabase/clients'

/** Singleton row in ingestion_orchestration_state for post-deploy funnel window. */
export const DETAIL_FIRST_METRICS_BASELINE_STATE_KEY = 'detail_first_metrics_baseline'

export function funnelIsoCutoff(params: {
  windowHours: number
  nowMs?: number
  metricsBaselineAt?: string | null
}): string {
  const nowMs = params.nowMs ?? Date.now()
  const windowCutoff = new Date(nowMs - params.windowHours * 60 * 60 * 1000).toISOString()
  const baseline = params.metricsBaselineAt?.trim()
  if (!baseline) return windowCutoff
  return baseline > windowCutoff ? baseline : windowCutoff
}

export function cohortQueryIsoCutoff(params: {
  maxLookbackHours: number
  nowMs?: number
  metricsBaselineAt?: string | null
}): string {
  return funnelIsoCutoff({
    windowHours: params.maxLookbackHours,
    nowMs: params.nowMs,
    metricsBaselineAt: params.metricsBaselineAt,
  })
}

export async function fetchDetailFirstMetricsBaselineAt(
  admin: ReturnType<typeof getAdminDb>
): Promise<string | null> {
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select('detail_first_metrics_baseline_at')
    .eq('key', DETAIL_FIRST_METRICS_BASELINE_STATE_KEY)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const at = data?.detail_first_metrics_baseline_at
  return typeof at === 'string' && at.trim() ? at : null
}

export async function setDetailFirstMetricsBaselineNow(
  admin: ReturnType<typeof getAdminDb>,
  at: Date = new Date()
): Promise<string> {
  const iso = at.toISOString()
  const { error } = await fromBase(admin, 'ingestion_orchestration_state').upsert(
    {
      key: DETAIL_FIRST_METRICS_BASELINE_STATE_KEY,
      cursor: 0,
      detail_first_metrics_baseline_at: iso,
      updated_at: iso,
    },
    { onConflict: 'key' }
  )

  if (error) {
    throw new Error(error.message)
  }

  return iso
}
