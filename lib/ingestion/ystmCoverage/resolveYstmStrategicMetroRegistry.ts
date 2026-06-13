import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { isMalformedIngestionCityName } from '@/lib/ingestion/discovery/promoteSourceDiscoveryResults'
import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import {
  YSTM_STRATEGIC_METRO_REGISTRY_V1,
  type YstmStrategicMetroRegistryEntry,
} from '@/lib/ingestion/ystmCoverage/ystmStrategicMetroRegistryV1'
import { logger } from '@/lib/log'

export type ResolvedYstmStrategicMetro = {
  entry: YstmStrategicMetroRegistryEntry
  config: ExternalCityConfigRow
}

function normalizeCityState(city: string, state: string): { city: string; state: string } {
  return {
    city: city.trim(),
    state: state.trim(),
  }
}

function pagesIncludePrincipalUrl(pages: string[], principalPageUrl: string): boolean {
  const target = principalPageUrl.trim().toLowerCase()
  return pages.some((page) => page.trim().toLowerCase() === target)
}

function isExcludedTier1Config(config: ExternalCityConfigRow): boolean {
  if (isMalformedIngestionCityName(config.city ?? '')) {
    return true
  }
  return false
}

function matchesRegistryEntry(
  config: ExternalCityConfigRow,
  entry: YstmStrategicMetroRegistryEntry
): boolean {
  if (config.id != null && config.id !== entry.configId) {
    return false
  }
  const { city, state } = normalizeCityState(config.city ?? '', config.state ?? '')
  if (city !== entry.city || state !== entry.state) {
    return false
  }
  const pages = normalizeSourcePages(config.source_pages)
  if (pages.length === 0) {
    return false
  }
  return pagesIncludePrincipalUrl(pages, entry.principalPageUrl)
}

export function resolveYstmStrategicMetroRegistry(params: {
  crawlableConfigs: ExternalCityConfigRow[]
}): {
  resolved: ResolvedYstmStrategicMetro[]
  unresolvedSlugs: string[]
} {
  const byId = new Map<string, ExternalCityConfigRow>()
  for (const config of params.crawlableConfigs) {
    if (config.id) {
      byId.set(config.id, config)
    }
  }

  const resolved: ResolvedYstmStrategicMetro[] = []
  const unresolvedSlugs: string[] = []

  for (const entry of YSTM_STRATEGIC_METRO_REGISTRY_V1) {
    const byConfigId = byId.get(entry.configId)
    const candidates = byConfigId
      ? [byConfigId]
      : params.crawlableConfigs.filter((config) => {
          const { city, state } = normalizeCityState(config.city ?? '', config.state ?? '')
          return city === entry.city && state === entry.state
        })

    const match = candidates.find(
      (config) => !isExcludedTier1Config(config) && matchesRegistryEntry(config, entry)
    )

    if (!match) {
      unresolvedSlugs.push(entry.slug)
      logger.warn('YSTM strategic metro registry entry unresolved', {
        component: 'ingestion/ystmCoverage/resolveYstmStrategicMetroRegistry',
        slug: entry.slug,
        configId: entry.configId,
        city: entry.city,
        state: entry.state,
      })
      continue
    }

    resolved.push({ entry, config: match })
  }

  return { resolved, unresolvedSlugs }
}
