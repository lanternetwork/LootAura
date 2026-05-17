import {
  type IngestionLaneContext,
  type IngestionLaneDefinition,
  isIngestionLaneModeEnabled,
  isIngestionLaneRotationEnabled,
  laneDefinitionForKey,
  legacyIngestionLaneContext,
  resolveIngestionLaneFromParam,
} from '@/lib/ingestion/ingestionLanes'
import { pickRotatedIngestionLane } from '@/lib/ingestion/ingestionLaneRotation'

export type ResolveIngestionLaneResult =
  | { ok: true; context: IngestionLaneContext }
  | { ok: false; status: number; code: string; message: string }

export async function resolveIngestionLaneContext(params: {
  mode: 'daily' | 'ingestion'
  laneParam: string | null
}): Promise<ResolveIngestionLaneResult> {
  if (!isIngestionLaneModeEnabled()) {
    return { ok: true, context: legacyIngestionLaneContext() }
  }

  if (params.laneParam != null && params.laneParam.trim() !== '') {
    const parsed = resolveIngestionLaneFromParam(params.laneParam)
    if (!parsed.ok) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_INGESTION_LANE',
        message: `Unknown or invalid ingestion lane: ${params.laneParam}`,
      }
    }
    return {
      ok: true,
      context: {
        laneModeEnabled: true,
        lane: parsed.lane,
        rotationApplied: false,
      },
    }
  }

  if (params.mode === 'ingestion' && isIngestionLaneRotationEnabled()) {
    const { lane } = await pickRotatedIngestionLane()
    return {
      ok: true,
      context: {
        laneModeEnabled: true,
        lane,
        rotationApplied: true,
      },
    }
  }

  const globalLane: IngestionLaneDefinition = laneDefinitionForKey('global')
  return {
    ok: true,
    context: {
      laneModeEnabled: true,
      lane: globalLane,
      rotationApplied: false,
    },
  }
}
