import type { YstmCoverageObservationAggregate } from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'

export type YstmCoverageAuditSelectionMode = 'metro_priority' | 'round_robin'

function buildConfigKey(city: string, state: string): string {
  return `${state}|${city}`
}

function sortConfigsDeterministic(rows: ExternalCityConfigRow[]): ExternalCityConfigRow[] {
  return [...rows].sort((a, b) => {
    const ak = `${a.state || ''}|${a.city || ''}`.toLowerCase()
    const bk = `${b.state || ''}|${b.city || ''}`.toLowerCase()
    return ak.localeCompare(bk)
  })
}

function metroKey(city: string, state: string): string {
  return `${(city ?? 'unknown').trim() || 'unknown'}, ${(state ?? 'unknown').trim() || 'unknown'}`
}

function scoreConfigForMetroPriority(
  config: ExternalCityConfigRow,
  missingByMetro: Record<string, number>,
  missingByState: Record<string, number>
): number {
  const st = (config.state ?? 'unknown').trim() || 'unknown'
  const metro = metroKey(config.city ?? '', st)
  const metroMissing = missingByMetro[metro] ?? 0
  const stateMissing = missingByState[st] ?? 0
  return metroMissing * 1000 + stateMissing
}

/** Rotate ordered list so processing starts at cursor index (mod length). */
export function rotateConfigsFromCursor<T>(ordered: T[], cursorBefore: number): T[] {
  const n = ordered.length
  if (n === 0) return []
  const start = ((cursorBefore % n) + n) % n
  return [...ordered.slice(start), ...ordered.slice(0, start)]
}

export function buildYstmCoverageAuditConfigOrder(params: {
  crawlableConfigs: ExternalCityConfigRow[]
  observationAgg: Pick<YstmCoverageObservationAggregate, 'missingByMetro' | 'missingByState'>
  bootstrapEnabled: boolean
  cursorBefore: number
}): {
  orderedConfigs: ExternalCityConfigRow[]
  selectionMode: YstmCoverageAuditSelectionMode
  catalogSize: number
} {
  const sorted = sortConfigsDeterministic(params.crawlableConfigs)
  const catalogSize = sorted.length

  if (!params.bootstrapEnabled || catalogSize === 0) {
    return {
      orderedConfigs: rotateConfigsFromCursor(sorted, params.cursorBefore),
      selectionMode: 'round_robin',
      catalogSize,
    }
  }

  const prioritySorted = [...sorted].sort((a, b) => {
    const scoreDelta =
      scoreConfigForMetroPriority(b, params.observationAgg.missingByMetro, params.observationAgg.missingByState) -
      scoreConfigForMetroPriority(a, params.observationAgg.missingByMetro, params.observationAgg.missingByState)
    if (scoreDelta !== 0) return scoreDelta
    const ak = buildConfigKey(a.city ?? '', a.state ?? '').toLowerCase()
    const bk = buildConfigKey(b.city ?? '', b.state ?? '').toLowerCase()
    return ak.localeCompare(bk)
  })

  return {
    orderedConfigs: rotateConfigsFromCursor(prioritySorted, params.cursorBefore),
    selectionMode: 'metro_priority',
    catalogSize,
  }
}
