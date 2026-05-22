import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

export type WeekOneSprintGateStatus = 'pass' | 'fail' | 'pending'

export type WeekOneSprintGate = {
  id: string
  label: string
  status: WeekOneSprintGateStatus
  detail: string
}

export type WeekOneSprintGatesSnapshot = {
  generatedAt: string
  gates: WeekOneSprintGate[]
  allPass: boolean
}

/**
 * Week-1 sprint exit criteria for admin scoreboard (footprint + discovery + repair).
 * Does not evaluate G4 hold or nationwide 90% on large V.
 */
export function evaluateWeekOneSprintGates(
  data: YstmCoverageMetricsResponse,
  nowMs: number = Date.now()
): WeekOneSprintGatesSnapshot {
  const ge = data.graphEnumeration
  const last = ge.lastDiscoveryRun
  const discoveryWorks =
    ge.candidatesDiscovered > 0 &&
    (last?.statesScanned ?? 0) > 0 &&
    (last?.phasesCompleted?.includes('graph_enumeration') ?? false)

  const crawlable = data.sourceExpansion.crawlableConfigs
  const noSource = data.sourceExpansion.configsWithoutSourcePages
  const repairQueue = data.catalogRepair.repairQueueTotal
  const validV = data.validActiveYstmUrls

  const gates: WeekOneSprintGate[] = [
    {
      id: 'discovery_registry',
      label: 'Graph enumeration registry',
      status: ge.candidatesDiscovered > 0 ? 'pass' : 'fail',
      detail: `candidates total ${ge.candidatesDiscovered.toLocaleString()}`,
    },
    {
      id: 'discovery_last_run',
      label: 'Last discovery scanned states',
      status:
        last && last.statesScanned > 0 && last.phasesCompleted.includes('graph_enumeration')
          ? 'pass'
          : last?.skipped
            ? 'pending'
            : 'fail',
      detail: last
        ? `${last.skipped ? 'skipped' : last.ok ? 'ok' : 'failed'} · ${last.statesScanned} states · phases ${
            last.phasesCompleted.join(', ') || 'none'
          }${last.skipReason ? ` · ${last.skipReason}` : ''}`
        : 'no discovery_cron run in orchestration notes',
    },
    {
      id: 'footprint_crawlable',
      label: 'Crawlable configs',
      status: crawlable >= 200 ? 'pass' : crawlable >= 100 ? 'pending' : 'fail',
      detail: `${crawlable.toLocaleString()} (target ≥200)`,
    },
    {
      id: 'footprint_no_source',
      label: 'Configs without source_pages',
      status: noSource < 600 ? 'pass' : noSource < 800 ? 'pending' : 'fail',
      detail: `${noSource.toLocaleString()} (target <600)`,
    },
    {
      id: 'repair_queue',
      label: 'Catalog repair queue',
      status: repairQueue < 100 ? 'pass' : repairQueue < 200 ? 'pending' : 'fail',
      detail: `${repairQueue.toLocaleString()} (target <100)`,
    },
    {
      id: 'audit_footprint',
      label: 'Valid-active audit URLs (V)',
      status: validV >= 300 ? 'pass' : validV >= 150 ? 'pending' : 'fail',
      detail: `${validV.toLocaleString()} (target ≥300)`,
    },
    {
      id: 'discovery_works_composite',
      label: 'Discovery pipeline (composite)',
      status: discoveryWorks ? 'pass' : 'fail',
      detail: discoveryWorks
        ? 'registry + last run graph_enumeration'
        : 'fix discovery (repo defaults; no Vercel env ramp)',
    },
  ]

  const requiredPass = gates.filter((g) => g.id !== 'discovery_works_composite')
  const allPass = requiredPass.every((g) => g.status === 'pass')

  return {
    generatedAt: new Date(nowMs).toISOString(),
    gates,
    allPass,
  }
}
