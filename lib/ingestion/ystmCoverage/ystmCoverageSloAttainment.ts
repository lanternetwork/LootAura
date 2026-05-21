import { YSTM_COVERAGE_SLO_MIN_VALID_URLS } from '@/lib/ingestion/ystmCoverage/ystmCoverageOperationalHealth'

/** Consecutive UTC days at target required for G4 program completion (Phase 7). */
export const YSTM_COVERAGE_SLO_STEADY_STATE_DAYS = 14

/** Recommended minimum audit footprint for nationwide G4 sign-off (Phase 7). */
export const YSTM_COVERAGE_PROGRAM_MIN_FOOTPRINT = 5000

export type YstmCoverageSloAttainmentTrendPoint = {
  completedAt: string
  coveragePct: number | null
  validActiveYstmUrls: number
}

export type YstmCoverageSloAttainment = {
  requiredConsecutiveDays: number
  consecutiveDaysAtTarget: number
  programMinFootprint: number
  footprintMeetsProgramMinimum: boolean
  latestDayQualifies: boolean
  programComplete: boolean
}

function utcDayKey(iso: string): string | null {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

/** Last completed audit per UTC day (chronological trend may include multiple runs per day). */
export function groupLastAuditPerUtcDay(
  trend: YstmCoverageSloAttainmentTrendPoint[]
): Map<string, YstmCoverageSloAttainmentTrendPoint> {
  const byDay = new Map<string, YstmCoverageSloAttainmentTrendPoint>()
  for (const point of trend) {
    if (point.coveragePct == null) continue
    const day = utcDayKey(point.completedAt)
    if (!day) continue
    byDay.set(day, point)
  }
  return byDay
}

function dayQualifiesForTarget(
  point: YstmCoverageSloAttainmentTrendPoint,
  targetPct: number,
  minValidUrlsPerDay: number
): boolean {
  return (
    point.coveragePct != null &&
    point.coveragePct >= targetPct &&
    point.validActiveYstmUrls >= minValidUrlsPerDay
  )
}

/** Count consecutive UTC days (most recent first) where the last audit of the day met the target. */
export function countConsecutiveDaysAtCoverageTarget(
  byDay: Map<string, YstmCoverageSloAttainmentTrendPoint>,
  targetPct: number,
  minValidUrlsPerDay: number
): number {
  const days = [...byDay.keys()].sort().reverse()
  let streak = 0
  for (const day of days) {
    const point = byDay.get(day)!
    if (!dayQualifiesForTarget(point, targetPct, minValidUrlsPerDay)) break
    streak += 1
  }
  return streak
}

export function computeCoverageSloAttainment(input: {
  trend: YstmCoverageSloAttainmentTrendPoint[]
  targetPct: number
  currentCoveragePct: number | null
  currentValidActiveUrls: number
  minValidUrlsPerDay?: number
  requiredConsecutiveDays?: number
  programMinFootprint?: number
}): YstmCoverageSloAttainment {
  const minValidUrlsPerDay = input.minValidUrlsPerDay ?? YSTM_COVERAGE_SLO_MIN_VALID_URLS
  const requiredConsecutiveDays = input.requiredConsecutiveDays ?? YSTM_COVERAGE_SLO_STEADY_STATE_DAYS
  const programMinFootprint = input.programMinFootprint ?? YSTM_COVERAGE_PROGRAM_MIN_FOOTPRINT

  const byDay = groupLastAuditPerUtcDay(input.trend)
  const consecutiveDaysAtTarget = countConsecutiveDaysAtCoverageTarget(
    byDay,
    input.targetPct,
    minValidUrlsPerDay
  )

  const latestDay = [...byDay.keys()].sort().reverse()[0]
  const latestPoint = latestDay ? byDay.get(latestDay) : undefined
  const latestDayQualifies =
    latestPoint != null && dayQualifiesForTarget(latestPoint, input.targetPct, minValidUrlsPerDay)

  const footprintMeetsProgramMinimum = input.currentValidActiveUrls >= programMinFootprint
  const currentAtTarget =
    input.currentCoveragePct != null && input.currentCoveragePct >= input.targetPct

  const programComplete =
    consecutiveDaysAtTarget >= requiredConsecutiveDays &&
    footprintMeetsProgramMinimum &&
    currentAtTarget &&
    latestDayQualifies

  return {
    requiredConsecutiveDays,
    consecutiveDaysAtTarget,
    programMinFootprint,
    footprintMeetsProgramMinimum,
    latestDayQualifies,
    programComplete,
  }
}
