/** Consecutive UTC days at zero duplicate canonical publishes required before Phase E sign-off. */
export const CROSS_PROVIDER_CONVERGENCE_SLO_STEADY_STATE_DAYS = 14

export type CrossProviderConvergenceSloTrendPoint = {
  sloDate: string
  duplicatePublishedCanonicalClusters: number
  recordedAt: string
}

export type CrossProviderConvergenceSloAttainment = {
  requiredConsecutiveDays: number
  consecutiveZeroDuplicateDays: number
  latestDayQualifies: boolean
  programComplete: boolean
}

export function computeCrossProviderConvergenceSloAttainment(input: {
  trend: CrossProviderConvergenceSloTrendPoint[]
  currentDuplicateClusters: number
  requiredConsecutiveDays?: number
}): CrossProviderConvergenceSloAttainment {
  const requiredConsecutiveDays =
    input.requiredConsecutiveDays ?? CROSS_PROVIDER_CONVERGENCE_SLO_STEADY_STATE_DAYS

  const byDay = new Map<string, CrossProviderConvergenceSloTrendPoint>()
  for (const point of input.trend) {
    byDay.set(point.sloDate, point)
  }

  const days = [...byDay.keys()].sort().reverse()
  let consecutiveZeroDuplicateDays = 0
  for (const day of days) {
    const clusters = byDay.get(day)!.duplicatePublishedCanonicalClusters
    if (clusters !== 0) break
    consecutiveZeroDuplicateDays += 1
  }

  const latestDay = days[0]
  const latestPoint = latestDay ? byDay.get(latestDay) : undefined
  const latestDayQualifies =
    latestPoint != null && latestPoint.duplicatePublishedCanonicalClusters === 0
  const currentQualifies = input.currentDuplicateClusters === 0

  const programComplete =
    consecutiveZeroDuplicateDays >= requiredConsecutiveDays &&
    currentQualifies &&
    latestDayQualifies

  return {
    requiredConsecutiveDays,
    consecutiveZeroDuplicateDays,
    latestDayQualifies,
    programComplete,
  }
}
