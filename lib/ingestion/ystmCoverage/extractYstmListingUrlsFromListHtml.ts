import { JSDOM } from 'jsdom'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'

export type ExtractedYstmListingUrl = {
  canonicalUrl: string
  sourceUrl: string
}

/**
 * Extract absolute YSTM detail listing URLs from a city/list source page HTML.
 */
export function extractYstmListingUrlsFromListHtml(html: string, pageUrl: string): ExtractedYstmListingUrl[] {
  const normalized = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return []

  const dom = new JSDOM(normalized, { url: pageUrl })
  const anchors = dom.window.document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="listing.html"], a[href*="userlisting.html"]'
  )
  const seen = new Set<string>()
  const out: ExtractedYstmListingUrl[] = []

  for (const a of anchors) {
    const href = a.getAttribute('href')?.trim() ?? a.href?.trim() ?? ''
    if (!href) continue
    let absolute: string
    try {
      absolute = new URL(href, pageUrl).href
    } catch {
      continue
    }
    if (!isYstmDetailListingUrl(absolute)) continue
    const canonical = canonicalSourceUrl(absolute)
    if (seen.has(canonical)) continue
    seen.add(canonical)
    out.push({ canonicalUrl: canonical, sourceUrl: absolute })
  }

  return out
}
