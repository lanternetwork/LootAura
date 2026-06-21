import { evaluateMissingIngestCronHealth, type MissingIngestCronHealth } from '@/lib/admin/evaluateMissingIngestCronHealth'
import { YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingIngestionConfig'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type { MissingIngestCronHealth }

export async function loadMissingIngestCronHealth(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<MissingIngestCronHealth> {
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select('last_started_at, last_completed_at')
    .eq('key', YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const row = data as { last_started_at?: string | null; last_completed_at?: string | null } | null

  return evaluateMissingIngestCronHealth(
    {
      lastStartedAt: row?.last_started_at ?? null,
      lastCompletedAt: row?.last_completed_at ?? null,
    },
    nowMs
  )
}
