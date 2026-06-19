import { JSDOM } from 'jsdom'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isYstmIngestibleListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'

export type ExtractedYstmListingUrl = {
  canonicalUrl: string
  sourceUrl: string
}

function decodeJsSingleQuotedJson(raw: string): string {
  return raw
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
}

function pushListingUrl(
  rawUrl: string,
  pageUrl: string,
  seen: Set<string>,
  out: ExtractedYstmListingUrl[]
): void {
  let absolute: string
  try {
    absolute = new URL(rawUrl.trim(), pageUrl).href
  } catch {
    return
  }
  if (!isYstmIngestibleListingUrl(absolute)) return
  const canonical = canonicalSourceUrl(absolute)
  if (seen.has(canonical)) return
  seen.add(canonical)
  out.push({ canonicalUrl: canonical, sourceUrl: absolute })
}

function extractYstmListingUrlsFromMetadataStr(
  html: string,
  pageUrl: string,
  seen: Set<string>,
  out: ExtractedYstmListingUrl[]
): void {
  const re = /metadataStr\s*=\s*'([\s\S]*?)';/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const encoded = match[1]
    if (!encoded) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(decodeJsSingleQuotedJson(encoded))
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue
    const sales = (parsed as { sales?: unknown }).sales
    if (!Array.isArray(sales)) continue
    for (const sale of sales) {
      if (!sale || typeof sale !== 'object') continue
      const row = sale as { url?: unknown; sale_url?: unknown }
      const raw =
        typeof row.url === 'string'
          ? row.url
          : typeof row.sale_url === 'string'
            ? row.sale_url
            : null
      if (!raw) continue
      pushListingUrl(raw, pageUrl, seen, out)
    }
  }
}

/**
 * Extract absolute YSTM detail listing URLs from a city/list source page HTML.
 * Uses listing anchors and embedded `metadataStr` sales (same sources as list ingest).
 */
export function extractYstmListingUrlsFromListHtml(html: string, pageUrl: string): ExtractedYstmListingUrl[] {
  const normalized = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return []

  const seen = new Set<string>()
  const out: ExtractedYstmListingUrl[] = []

  const dom = new JSDOM(normalized, { url: pageUrl })
  const anchors = dom.window.document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="listing.html"], a[href*="userlisting.html"], a[href*="sale.php"]'
  )

  for (const a of anchors) {
    const href = a.getAttribute('href')?.trim() ?? a.href?.trim() ?? ''
    if (!href) continue
    pushListingUrl(href, pageUrl, seen, out)
  }

  extractYstmListingUrlsFromMetadataStr(normalized, pageUrl, seen, out)

  return out
}
