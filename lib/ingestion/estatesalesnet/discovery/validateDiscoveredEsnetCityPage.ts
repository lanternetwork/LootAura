import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import type { DiscoveryValidationResult } from '@/lib/ingestion/discovery/sourceDiscoveryValidator'
import { isEstatesalesNetSourceUrl } from '@/lib/ingestion/estatesalesnet/esnetHosts'
import { extractEsnetNgrxStateFromHtml } from '@/lib/ingestion/estatesalesnet/esnetNgrxState'

function isCanonicalEsnetMetroUrl(pageUrl: string): boolean {
  if (!isEstatesalesNetSourceUrl(pageUrl)) return false
  const parts = new URL(pageUrl.trim()).pathname.split('/').filter(Boolean)
  return parts.length === 2 && /^[A-Z]{2}$/i.test(parts[0] ?? '') && Boolean(parts[1])
}

function ngrxHasMetroListShape(root: Record<string, unknown>): boolean {
  const ngrx = root.NGRX_STATE as Record<string, unknown> | undefined
  if (!ngrx) return false
  const sales = ngrx.sales as Record<string, unknown> | undefined
  if (sales && typeof sales.saleRows === 'object' && sales.saleRows !== null) return true
  const feature = ngrx.feature as Record<string, unknown> | undefined
  const view = feature?.traditionalSaleViewState as Record<string, unknown> | undefined
  return Boolean(view?.entitiesById && typeof view.entitiesById === 'object')
}

export function validateDiscoveredEsnetCityPage(args: {
  html: string
  pageUrl: string
  city: string
  state: string
}): DiscoveryValidationResult {
  const canonical = args.pageUrl.trim().replace(/\/$/, '')
  if (!isCanonicalEsnetMetroUrl(canonical)) {
    return { ok: false, reason: 'not_canonical_esnet_metro_url' }
  }
  if (normalizeSourcePages([canonical]).length === 0) {
    return { ok: false, reason: 'source_page_not_https' }
  }

  const root = extractEsnetNgrxStateFromHtml(args.html, canonical)
  if (!root || !ngrxHasMetroListShape(root)) {
    return { ok: false, reason: 'missing_esnet_ngrx_metro_state' }
  }

  return { ok: true, kind: 'valid_city_page' }
}
