import {
  extractCityPageCandidatesFromStateIndexHtml,
  type DiscoveredCityPageCandidate,
  type SourceStateIndexEntry,
} from '@/lib/ingestion/discovery/sourceDiscovery'
import {
  detectHubDrift,
  validateDiscoveredCityPage,
  type DiscoveryValidationResult,
} from '@/lib/ingestion/discovery/sourceDiscoveryValidator'
import { extractEsnetCityPageCandidatesFromStateIndexHtml } from '@/lib/ingestion/estatesalesnet/discovery/extractEsnetCityPageCandidates'
import {
  getEsnetStateIndexEntries,
  type EsnetStateIndexEntry,
} from '@/lib/ingestion/estatesalesnet/discovery/esnetStateIndexCatalog'
import { validateDiscoveredEsnetCityPage } from '@/lib/ingestion/estatesalesnet/discovery/validateDiscoveredEsnetCityPage'
import { getVerifiedStateIndexEntries } from '@/lib/ingestion/discovery/sourceStateIndexCatalog'
import { hashHostForLog } from '@/lib/ingestion/adapters/externalPageSafeFetch'

export type RevalidationSourcePlatform = 'external_page_source' | 'estatesales_net'

export type RevalidationPlatformAdapter = {
  sourcePlatform: RevalidationSourcePlatform
  adapterId: string
  fetchHostHash: string
  getStateIndexEntries: (stateCodes?: string[]) => Array<{ stateCode: string; indexUrl: string }>
  extractCandidatesFromStateIndexHtml: (
    html: string,
    entry: { stateCode: string; indexUrl: string }
  ) => DiscoveredCityPageCandidate[]
  validateDiscoveredPage: (args: {
    html: string
    pageUrl: string
    city: string
    state: string
  }) => DiscoveryValidationResult
  detectHubDrift: (configCity: string, canonicalUrl: string) => boolean
}

export const EXTERNAL_PAGE_REVALIDATION_ADAPTER: RevalidationPlatformAdapter = {
  sourcePlatform: 'external_page_source',
  adapterId: 'external_source_revalidation',
  fetchHostHash: hashHostForLog('yardsaletreasuremap.com'),
  getStateIndexEntries: (stateCodes) => getVerifiedStateIndexEntries(stateCodes),
  extractCandidatesFromStateIndexHtml: (html, entry) =>
    extractCityPageCandidatesFromStateIndexHtml(html, entry as SourceStateIndexEntry),
  validateDiscoveredPage: validateDiscoveredCityPage,
  detectHubDrift,
}

export const ESNET_REVALIDATION_ADAPTER: RevalidationPlatformAdapter = {
  sourcePlatform: 'estatesales_net',
  adapterId: 'estatesales_net_revalidation',
  fetchHostHash: hashHostForLog('www.estatesales.net'),
  getStateIndexEntries: (stateCodes) => getEsnetStateIndexEntries(stateCodes),
  extractCandidatesFromStateIndexHtml: (html, entry) =>
    extractEsnetCityPageCandidatesFromStateIndexHtml(html, entry as EsnetStateIndexEntry),
  validateDiscoveredPage: validateDiscoveredEsnetCityPage,
  detectHubDrift: () => false,
}

export function resolveRevalidationPlatformAdapter(
  sourcePlatform?: RevalidationSourcePlatform
): RevalidationPlatformAdapter {
  return sourcePlatform === 'estatesales_net'
    ? ESNET_REVALIDATION_ADAPTER
    : EXTERNAL_PAGE_REVALIDATION_ADAPTER
}
