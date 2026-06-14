import {
  BOOTSTRAP_COVERAGE_AUDIT,
  STEADY_COVERAGE_AUDIT,
} from '@/lib/ingestion/ystmCoverage/coverageBudgetProfiles'

export type YstmDiscoveryCapacityTarget = '48h' | '24h' | '4h'

export type YstmDiscoveryCapacityPlanRow = {
  target: YstmDiscoveryCapacityTarget
  targetHours: number
  activeConfigCount: number
  requiredChecksPerDay: number
  currentChecksPerDay: number
  requiredRunsPerDay: number
  gapChecksPerDay: number
  feasibleWithCurrentBudget: boolean
}

export function computeRequiredConfigChecksPerDay(activeConfigCount: number, targetHours: number): number {
  if (activeConfigCount <= 0 || targetHours <= 0) return 0
  return Math.ceil((activeConfigCount * 24) / targetHours)
}

export function buildYstmDiscoveryCapacityPlan(params: {
  activeConfigCount: number
  auditRunsPerDay?: number
  maxConfigsPerRun?: number
  bootstrapEnabled?: boolean
}): YstmDiscoveryCapacityPlanRow[] {
  const profile = params.bootstrapEnabled ? BOOTSTRAP_COVERAGE_AUDIT : STEADY_COVERAGE_AUDIT
  const auditRunsPerDay = params.auditRunsPerDay ?? 4
  const maxConfigsPerRun = params.maxConfigsPerRun ?? profile.maxConfigsPerRun
  const currentChecksPerDay = auditRunsPerDay * maxConfigsPerRun

  const targets: Array<{ target: YstmDiscoveryCapacityTarget; targetHours: number }> = [
    { target: '48h', targetHours: 48 },
    { target: '24h', targetHours: 24 },
    { target: '4h', targetHours: 4 },
  ]

  return targets.map(({ target, targetHours }) => {
    const requiredChecksPerDay = computeRequiredConfigChecksPerDay(params.activeConfigCount, targetHours)
    const requiredRunsPerDay =
      maxConfigsPerRun > 0 ? Math.ceil(requiredChecksPerDay / maxConfigsPerRun) : 0
    const gapChecksPerDay = Math.max(0, requiredChecksPerDay - currentChecksPerDay)
    return {
      target,
      targetHours,
      activeConfigCount: params.activeConfigCount,
      requiredChecksPerDay,
      currentChecksPerDay,
      requiredRunsPerDay,
      gapChecksPerDay,
      feasibleWithCurrentBudget: gapChecksPerDay === 0,
    }
  })
}
