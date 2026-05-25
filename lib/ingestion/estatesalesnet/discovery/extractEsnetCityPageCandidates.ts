import type { DiscoveredCityPageCandidate } from '@/lib/ingestion/discovery/sourceDiscovery'
import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { normalizeIngestionCity } from '@/lib/ingestion/normalizeIngestionLocation'
import {
  ESNET_LIST_ORIGIN,
  type EsnetStateIndexEntry,
} from '@/lib/ingestion/estatesalesnet/discovery/esnetStateIndexCatalog'
import { isEstatesalesNetListHost } from '@/lib/ingestion/estatesalesnet/esnetHosts'
import { JSDOM } from 'jsdom'

function isEsnetMetroListHref(href: string, stateCode: string): boolean {
  if (!href?.trim()) return false
  let url: URL
  try {
    url = new URL(href.trim(), ESNET_LIST_ORIGIN)
  } catch {
    return false
  }
  if (!isEstatesalesNetListHost(url.hostname)) return false
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 2) return false
  if (parts[0]?.toUpperCase() !== stateCode.toUpperCase()) return false
  const citySlug = parts[1] ?? ''
  if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(citySlug)) return false
  if (/^\d{5}$/.test(citySlug)) return false
  return true
}

/**
 * Extract metro list page candidates from `https://www.estatesales.net/{STATE}` index HTML.
 */
export function extractEsnetCityPageCandidatesFromStateIndexHtml(
  html: string,
  indexEntry: EsnetStateIndexEntry
): DiscoveredCityPageCandidate[] {
  const dom = new JSDOM(html, { url: indexEntry.indexUrl })
  const anchors = dom.window.document.querySelectorAll<HTMLAnchorElement>('a[href]')
  const seen = new Set<string>()
  const out: DiscoveredCityPageCandidate[] = []

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href')?.trim()
    if (!href || !isEsnetMetroListHref(href, indexEntry.stateCode)) continue

    const canonicalUrl = new URL(href, ESNET_LIST_ORIGIN).href.replace(/\/$/, '')
    if (normalizeSourcePages([canonicalUrl]).length === 0) continue
    if (seen.has(canonicalUrl)) continue
    seen.add(canonicalUrl)

    const parts = new URL(canonicalUrl).pathname.split('/').filter(Boolean)
    const citySlug = parts[1] ?? ''
    const city = normalizeIngestionCity(citySlug.replace(/-/g, ' ')) ?? citySlug.replace(/-/g, ' ')

    out.push({
      city,
      state: indexEntry.stateCode,
      statePathSegment: indexEntry.stateCode,
      canonicalUrl,
      sharedHubPage: false,
      cityPathSegment: citySlug,
    })
  }

  return out
}
