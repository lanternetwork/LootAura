import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import {
  allLaneStateKeysForSeed,
  isIngestionLaneModeEnabled,
  laneDefinitionForKey,
  LEGACY_ORCHESTRATION_STATE_KEY,
  LANE_ROTATION_STATE_KEY,
  type IngestionLaneKey,
  ALL_INGESTION_LANE_KEYS,
} from '@/lib/ingestion/ingestionLanes'

export type IngestionLaneStateSummary = {
  laneKey: string
  laneType: string
  laneRegion: string | null
  stateKey: string
  cursor: number
}

export function primaryOrchestrationStateKeyForMetrics(): string {
  return isIngestionLaneModeEnabled()
    ? laneDefinitionForKey('global').stateKey
    : LEGACY_ORCHESTRATION_STATE_KEY
}

export async function fetchIngestionLaneStateSummaries(
  admin: ReturnType<typeof getAdminDb>
): Promise<IngestionLaneStateSummary[]> {
  if (!isIngestionLaneModeEnabled()) {
    return []
  }
  const keys = allLaneStateKeysForSeed().filter((k) => k !== LANE_ROTATION_STATE_KEY)
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_state')
    .select('key, cursor')
    .in('key', keys)
  if (error || !Array.isArray(data)) {
    return ALL_INGESTION_LANE_KEYS.map((laneKey: IngestionLaneKey) => {
      const lane = laneDefinitionForKey(laneKey)
      return {
        laneKey: lane.laneKey,
        laneType: lane.laneType,
        laneRegion: lane.laneRegion,
        stateKey: lane.stateKey,
        cursor: 0,
      }
    })
  }
  const byKey = new Map(
    (data as { key: string; cursor: number }[]).map((row) => [row.key, row.cursor ?? 0])
  )
  return ALL_INGESTION_LANE_KEYS.map((laneKey: IngestionLaneKey) => {
    const lane = laneDefinitionForKey(laneKey)
    return {
      laneKey: lane.laneKey,
      laneType: lane.laneType,
      laneRegion: lane.laneRegion,
      stateKey: lane.stateKey,
      cursor: byKey.get(lane.stateKey) ?? 0,
    }
  })
}
