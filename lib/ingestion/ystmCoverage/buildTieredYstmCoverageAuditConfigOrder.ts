import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { rotateConfigsFromCursor } from '@/lib/ingestion/ystmCoverage/selectYstmCoverageAuditConfigs'
import type { ResolvedYstmStrategicMetro } from '@/lib/ingestion/ystmCoverage/resolveYstmStrategicMetroRegistry'

export type YstmCoverageAuditConfigSlot = {
  config: ExternalCityConfigRow
  tier: 1 | 2
  selectionIndex: number
}

export type YstmCoverageConfigStalenessMap = Record<string, number | null>

function buildConfigKey(city: string, state: string): string {
  return `${state}|${city}`
}

function configIdentityKey(config: ExternalCityConfigRow): string {
  if (config.id) {
    return `id:${config.id}`
  }
  return buildConfigKey(config.city ?? '', config.state ?? '')
}

function sortConfigsDeterministic(rows: ExternalCityConfigRow[]): ExternalCityConfigRow[] {
  return [...rows].sort((a, b) => {
    const ak = buildConfigKey(a.city ?? '', a.state ?? '').toLowerCase()
    const bk = buildConfigKey(b.city ?? '', b.state ?? '').toLowerCase()
    return ak.localeCompare(bk)
  })
}

export function isYstmStrategicConfigStale(params: {
  config: ExternalCityConfigRow
  configStalenessHoursByKey: YstmCoverageConfigStalenessMap
  refreshTargetHours: number
}): boolean {
  const configKey = buildConfigKey(params.config.city ?? '', params.config.state ?? '')
  const hoursSince = params.configStalenessHoursByKey[configKey]
  if (hoursSince == null) {
    return true
  }
  return hoursSince >= params.refreshTargetHours
}

export function computeTier1ReserveMax(staleTier1Count: number, maxConfigsPerRun: number): number {
  if (staleTier1Count <= 0 || maxConfigsPerRun <= 0) {
    return 0
  }
  return Math.min(staleTier1Count, Math.floor(maxConfigsPerRun / 2))
}

export function buildTieredYstmCoverageAuditConfigOrder(params: {
  crawlableConfigs: ExternalCityConfigRow[]
  resolvedStrategic: ResolvedYstmStrategicMetro[]
  configStalenessHoursByKey: YstmCoverageConfigStalenessMap
  longTailCursorBefore: number
  maxConfigsPerRun: number
  nowMs?: number
}): {
  slots: YstmCoverageAuditConfigSlot[]
  tier1Scheduled: number
  tier2Scheduled: number
  longTailCursorBefore: number
  longTailCursorAfter: number
  longTailPoolSize: number
  selectionMode: 'tiered'
} {
  const strategicConfigs = params.resolvedStrategic.map((item) => item.config)
  const strategicIdentityKeys = new Set(strategicConfigs.map((config) => configIdentityKey(config)))

  const staleStrategic = sortConfigsDeterministic(
    strategicConfigs.filter((config) => {
      const entry = params.resolvedStrategic.find((item) => item.config === config)
      const refreshTargetHours = entry?.entry.refreshTargetHours ?? 24
      return isYstmStrategicConfigStale({
        config,
        configStalenessHoursByKey: params.configStalenessHoursByKey,
        refreshTargetHours,
      })
    })
  ).sort((a, b) => {
    const aKey = buildConfigKey(a.city ?? '', a.state ?? '')
    const bKey = buildConfigKey(b.city ?? '', b.state ?? '')
    const aHours = params.configStalenessHoursByKey[aKey]
    const bHours = params.configStalenessHoursByKey[bKey]
    const aScore = aHours == null ? Number.POSITIVE_INFINITY : aHours
    const bScore = bHours == null ? Number.POSITIVE_INFINITY : bHours
    if (bScore !== aScore) {
      return bScore - aScore
    }
    return aKey.toLowerCase().localeCompare(bKey.toLowerCase())
  })

  const tier1ReserveMax = computeTier1ReserveMax(staleStrategic.length, params.maxConfigsPerRun)
  const tier1Slice = staleStrategic.slice(0, tier1ReserveMax)

  const longTailPool = sortConfigsDeterministic(
    params.crawlableConfigs.filter((config) => !strategicIdentityKeys.has(configIdentityKey(config)))
  )
  const longTailPoolSize = longTailPool.length
  const longTailOrdered = rotateConfigsFromCursor(longTailPool, params.longTailCursorBefore)

  const remainingBudget = Math.max(0, params.maxConfigsPerRun - tier1Slice.length)
  const tier2Slice = longTailOrdered.slice(0, remainingBudget)

  const slots: YstmCoverageAuditConfigSlot[] = []
  let selectionIndex = 0
  for (const config of tier1Slice) {
    slots.push({ config, tier: 1, selectionIndex })
    selectionIndex += 1
  }
  for (const config of tier2Slice) {
    slots.push({ config, tier: 2, selectionIndex })
    selectionIndex += 1
  }

  const longTailCursorAfter =
    longTailPoolSize > 0
      ? (params.longTailCursorBefore + tier2Slice.length) % longTailPoolSize
      : 0

  return {
    slots,
    tier1Scheduled: tier1Slice.length,
    tier2Scheduled: tier2Slice.length,
    longTailCursorBefore: params.longTailCursorBefore,
    longTailCursorAfter,
    longTailPoolSize,
    selectionMode: 'tiered',
  }
}
