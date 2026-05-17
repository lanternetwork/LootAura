import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import {
  type IngestionLaneDefinition,
  type IngestionLaneKey,
  LANE_ROTATION_STATE_KEY,
  laneDefinitionForKey,
  parseIngestionLaneRotationList,
} from '@/lib/ingestion/ingestionLanes'
import { ensureIngestionOrchestrationStateRow } from '@/lib/ingestion/ingestionOrchestrationLease'

export async function pickRotatedIngestionLane(): Promise<{
  lane: IngestionLaneDefinition
  rotationIndex: number
}> {
  const rotationList = parseIngestionLaneRotationList()
  if (rotationList.length === 0) {
    const lane = laneDefinitionForKey('global')
    return { lane, rotationIndex: 0 }
  }

  await ensureIngestionOrchestrationStateRow(LANE_ROTATION_STATE_KEY, {
    component: 'ingestion/ingestionLaneRotation',
    operation: 'ensure_rotation_state',
  })

  const adminDb = getAdminDb()
  const { data, error } = await fromBase(adminDb, 'ingestion_orchestration_state')
    .select('cursor')
    .eq('key', LANE_ROTATION_STATE_KEY)
    .limit(1)

  let index = 0
  if (!error && Array.isArray(data) && data.length > 0) {
    const raw = (data[0] as { cursor?: number }).cursor
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      index = Math.floor(raw) % rotationList.length
    }
  }

  const laneKey = rotationList[index] as IngestionLaneKey
  const nextIndex = (index + 1) % rotationList.length

  const { error: updateError } = await fromBase(adminDb, 'ingestion_orchestration_state')
    .update({ cursor: nextIndex, updated_at: new Date().toISOString() })
    .eq('key', LANE_ROTATION_STATE_KEY)

  if (updateError) {
    logger.warn('Failed to advance ingestion lane rotation cursor', {
      component: 'ingestion/ingestionLaneRotation',
      message: updateError.message,
    })
  }

  return { lane: laneDefinitionForKey(laneKey), rotationIndex: index }
}
