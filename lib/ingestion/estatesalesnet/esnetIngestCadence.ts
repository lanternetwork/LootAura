import {
  fetchEsnetIngestLaneLastCompletedAt,
  touchEsnetIngestLaneCompleted,
} from '@/lib/ingestion/estatesalesnet/esnetOrchestrationState'
import { parseEsnetIngestMinIntervalMinutes } from '@/lib/ingestion/estatesalesnet/esnetIngestionOrchestrationDefaults'
import { getAdminDb } from '@/lib/supabase/clients'

export type EsnetIngestCadenceDecision = {
  shouldRun: boolean
  skipReason: string | null
  minIntervalMinutes: number
  lastCompletedAt: string | null
}

export async function evaluateEsnetIngestCadence(args: {
  bootstrapEnabled: boolean
  nowMs?: number
  admin?: ReturnType<typeof getAdminDb>
}): Promise<EsnetIngestCadenceDecision> {
  const admin = args.admin ?? getAdminDb()
  const minIntervalMinutes = parseEsnetIngestMinIntervalMinutes(args.bootstrapEnabled)
  const lastCompletedAt = await fetchEsnetIngestLaneLastCompletedAt(admin)
  const nowMs = args.nowMs ?? Date.now()

  if (!lastCompletedAt) {
    return { shouldRun: true, skipReason: null, minIntervalMinutes, lastCompletedAt }
  }

  const elapsedMs = nowMs - Date.parse(lastCompletedAt)
  const windowMs = minIntervalMinutes * 60 * 1000
  if (elapsedMs < windowMs) {
    return {
      shouldRun: false,
      skipReason: 'esnet_ingest_cadence_throttle',
      minIntervalMinutes,
      lastCompletedAt,
    }
  }

  return { shouldRun: true, skipReason: null, minIntervalMinutes, lastCompletedAt }
}

export async function recordEsnetIngestCadenceCompleted(
  admin: ReturnType<typeof getAdminDb> = getAdminDb(),
  at: Date = new Date()
): Promise<void> {
  await touchEsnetIngestLaneCompleted(admin, at)
}
