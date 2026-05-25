import { JSDOM } from 'jsdom'
import { deriveYardsaleTreasureMapCityPageUrl } from '@/lib/ingestion/ensureCityConfigFromListingSource'
import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { normalizeIngestionCity } from '@/lib/ingestion/normalizeIngestionLocation'
import { isYstmStateShellCityPageUrl } from '@/lib/ingestion/discovery/ystmCityListPageUrl'

export type DiscoveryValidationResult =
  | { ok: true; kind: 'valid_city_page' }
  | { ok: true; kind: 'valid_empty_city_page' }
  | { ok: false; reason: string }

const CITY_PAGE_H1_RE =
  /garage sales\s*&\s*yard sales\s+in\s+.+,\s*.+/i

/** Regional list pages referenced by multiple municipality configs in production. */
export const SHARED_METRO_HUB_SLUGS = new Set(['Chicago', 'Midlothian'])

export function isSharedMetroHubSlug(cityPathSegment: string): boolean {
  const base = cityPathSegment.replace(/\.html?$/i, '')
  const normalized = normalizeIngestionCity(base)
  return normalized != null && SHARED_METRO_HUB_SLUGS.has(normalized)
}

function countExternalListingAnchors(document: Document): number {
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="listing.html"], a[href*="userlisting.html"]'
  )
  let count = 0
  for (const a of anchors) {
    const href = a.getAttribute('href')?.trim() ?? ''
    if (!href || !/\/(?:listing|userlisting)\.html/i.test(href)) continue
    if (!/^https:\/\//i.test(href) && !href.startsWith('/US/')) continue
    count += 1
  }
  return count
}

function hasValidEmptyCityPageSignals(document: Document): boolean {
  if (document.querySelector('[data-ystm-empty-list]')) return true
  if (document.querySelector('.sales-results-empty')) return true
  const desc = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
  if (/\b0\s+garage sales\b/i.test(desc)) return true
  const bodyText = document.body?.textContent ?? ''
  if (/no garage sales matched/i.test(bodyText)) return true
  return false
}

function hasExternalCityPageStructure(document: Document): boolean {
  const tagline = document.querySelector('p.tagline, .tagline')
  const h1 = document.querySelector('h1')
  if (!tagline?.textContent?.trim()) return false
  const h1Text = h1?.textContent?.trim() ?? ''
  if (!CITY_PAGE_H1_RE.test(h1Text)) return false
  return true
}

export type ValidateDiscoveredCityPageArgs = {
  html: string
  pageUrl: string
  city: string
  state: string
}

/**
 * Validates a discovered external source city list list page. Listing count alone is not sufficient:
 * empty pages require explicit empty-valid structure markers.
 */
export function validateDiscoveredCityPage(
  args: ValidateDiscoveredCityPageArgs
): DiscoveryValidationResult {
  const canonical = deriveYardsaleTreasureMapCityPageUrl(args.pageUrl)
  if (!canonical) {
    return { ok: false, reason: 'not_canonical_city_page_url' }
  }
  if (isYstmStateShellCityPageUrl(canonical)) {
    return { ok: false, reason: 'state_shell_not_city_page' }
  }
  if (normalizeSourcePages([args.pageUrl]).length === 0) {
    return { ok: false, reason: 'source_page_not_https' }
  }
  if (canonical !== args.pageUrl.replace(/\/$/, '')) {
    return { ok: false, reason: 'non_canonical_city_page_url' }
  }

  const dom = new JSDOM(args.html, { url: args.pageUrl })
  const { document } = dom.window

  if (!hasExternalCityPageStructure(document)) {
    return { ok: false, reason: 'missing_city_page_markers' }
  }

  const listingAnchorCount = countExternalListingAnchors(document)
  if (listingAnchorCount > 0) {
    return { ok: true, kind: 'valid_city_page' }
  }

  if (!hasValidEmptyCityPageSignals(document)) {
    return { ok: false, reason: 'empty_page_missing_valid_empty_signals' }
  }

  return { ok: true, kind: 'valid_empty_city_page' }
}

/** Shared hub URLs may differ from config municipality slug by design. */
export function detectHubDrift(configCity: string, canonicalUrl: string): boolean {
  let parts: string[]
  try {
    parts = new URL(canonicalUrl).pathname.split('/').filter(Boolean)
  } catch {
    return false
  }
  const citySegment = parts[2] ?? ''
  if (!citySegment || isSharedMetroHubSlug(citySegment)) return false
  const urlCity = normalizeIngestionCity(citySegment.replace(/\.html?$/i, ''))
  const cfgCity = normalizeIngestionCity(configCity)
  if (!urlCity || !cfgCity) return false
  return urlCity !== cfgCity
}
