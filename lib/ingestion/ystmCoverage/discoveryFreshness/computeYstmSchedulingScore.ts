import type { YstmVelocityPool } from '@/lib/ingestion/ystmCoverage/discoveryFreshness/classifyYstmConfigInventory'
import { velocityPoolWeight } from '@/lib/ingestion/ystmCoverage/discoveryFreshness/classifyYstmConfigInventory'

/** Higher score = schedule sooner (staleness × velocity weight). */
export function computeYstmSchedulingScore(params: {
  stalenessHours: number | null
  velocityPool: YstmVelocityPool
}): number {
  const staleness = params.stalenessHours == null ? Number.POSITIVE_INFINITY : params.stalenessHours
  return staleness * velocityPoolWeight(params.velocityPool)
}

export function compareYstmSchedulingScore(
  aScore: number,
  bScore: number,
  aTieKey: string,
  bTieKey: string
): number {
  if (bScore !== aScore) return bScore - aScore
  return aTieKey.toLowerCase().localeCompare(bTieKey.toLowerCase())
}
