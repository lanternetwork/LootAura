import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { isCrawlExcludedDiscoveryRow } from '@/lib/ingestion/discovery/discoveryPlaceholderPolicy'
import type { IngestionCityConfigDiscoveryRow } from '@/lib/ingestion/discovery/promoteSourceDiscoveryResults'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'
import { normalizeIngestionState } from '@/lib/ingestion/normalizeIngestionLocation'

export type RevalidationSelectionMode = 'balanced' | 'no_source_pages_only'

export type RevalidationSelectionOptions = {
  max: number
  states?: string[]
  mode?: RevalidationSelectionMode
}

function configScopeKey(city: string, state: string): string {
  return `${state}|${city}`.toLowerCase()
}

function isManualProtectedRow(row: IngestionCityConfigDiscoveryRow): boolean {
  return row.source_discovery_status === SOURCE_DISCOVERY_STATUS.manual
}

function revalidationPriorityTier(row: IngestionCityConfigDiscoveryRow): number {
  if (isManualProtectedRow(row)) return 99
  const pages = normalizeSourcePages(row.source_pages)
  if (pages.length === 0) return 0
  if (row.source_discovery_status === SOURCE_DISCOVERY_STATUS.pending) return 1
  if (row.source_discovery_status === SOURCE_DISCOVERY_STATUS.failed) return 2
  return 3
}

/**
 * Selects bounded revalidation rows for nationwide source expansion (Phase 2).
 * Prioritizes enabled configs with empty `source_pages` before general revalidation.
 */
export function selectRevalidationConfigRows(
  rows: IngestionCityConfigDiscoveryRow[],
  options: RevalidationSelectionOptions
): IngestionCityConfigDiscoveryRow[] {
  const mode = options.mode ?? 'balanced'
  const stateSet =
    options.states && options.states.length > 0
      ? new Set(options.states.map((s) => normalizeIngestionState(s)).filter(Boolean) as string[])
      : null

  const eligible = rows.filter((row) => {
    if (!row.enabled) return false
    if (isCrawlExcludedDiscoveryRow(row)) return false
    if (stateSet) {
      const st = normalizeIngestionState(row.state)
      if (!st || !stateSet.has(st)) return false
    }
    if (mode === 'no_source_pages_only') {
      if (isManualProtectedRow(row)) return false
      return normalizeSourcePages(row.source_pages).length === 0
    }
    return true
  })

  return [...eligible]
    .sort((a, b) => {
      const tierDiff = revalidationPriorityTier(a) - revalidationPriorityTier(b)
      if (tierDiff !== 0) return tierDiff
      return configScopeKey(a.city, a.state).localeCompare(configScopeKey(b.city, b.state))
    })
    .slice(0, options.max)
}
