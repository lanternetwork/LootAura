import { JSDOM } from 'jsdom'
import { extractDateRangeFromText } from '@/lib/ingestion/saleWindowDates'
import { parseYstmListMetadataDateValue } from '@/lib/ingestion/ystmCoverage/ystmListMetadataDate'

export type YstmSalePhpParsed =
  | {
      ok: true
      title: string | null
      description: string | null
      addressRaw: string | null
      startDate: string | null
      endDate: string | null
      lat: number | null
      lng: number | null
      imageUrls: string[]
    }
  | { ok: false; reason: 'sale_php_unsupported' | 'unparseable_detail' }

function readText(el: Element | null): string | null {
  const text = el?.textContent?.replace(/\s+/g, ' ').trim()
  return text && text.length > 0 ? text : null
}

function readCoordAttr(el: Element | null, attr: string): number | null {
  const raw = el?.getAttribute(attr)
  if (!raw?.trim()) return null
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Parse YSTM sale.php community/spreadsheet detail HTML.
 */
export function parseYstmSalePhpFromHtml(input: {
  html: string
  sourceUrl: string
}): YstmSalePhpParsed {
  const html = input.html.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!html.trim()) return { ok: false, reason: 'unparseable_detail' }

  let url: URL
  try {
    url = new URL(input.sourceUrl)
  } catch {
    return { ok: false, reason: 'sale_php_unsupported' }
  }
  if (!/\/sale\.php$/i.test(url.pathname)) {
    return { ok: false, reason: 'sale_php_unsupported' }
  }
  const hasCommunity = Boolean(url.searchParams.get('communitysale')?.trim())
  const hasId = Boolean(url.searchParams.get('id')?.trim())
  const hasSpreadsheet = Boolean(url.searchParams.get('spreadsheet')?.trim())
  if (!hasCommunity && !(hasId && hasSpreadsheet) && !hasId) {
    return { ok: false, reason: 'sale_php_unsupported' }
  }

  const dom = new JSDOM(html, { url: input.sourceUrl })
  const doc = dom.window.document
  const title = readText(doc.querySelector('.listing h1') ?? doc.querySelector('h1'))
  const addressRaw = readText(doc.getElementById('address'))
  const description =
    readText(doc.querySelector('.listing .content')) ??
    readText(doc.querySelector('.content'))

  const mapEl = doc.querySelector('#map, .map, [data-lat][data-lng]')
  const lat =
    readCoordAttr(mapEl, 'data-lat') ??
    readCoordAttr(doc.body, 'data-lat')
  const lng =
    readCoordAttr(mapEl, 'data-lng') ??
    readCoordAttr(doc.body, 'data-lng')

  const dateText = readText(doc.querySelector('.listing .date, .date, #date'))
  const fromText = dateText ? extractDateRangeFromText(dateText) : {}
  let startDate = fromText.start ?? null
  let endDate = fromText.end ?? null

  const metaDate = doc.querySelector('meta[property="og:description"], meta[name="description"]')
  const metaContent = metaDate?.getAttribute('content')
  if (metaContent) {
    const metaRange = extractDateRangeFromText(metaContent)
    startDate = startDate ?? metaRange.start ?? null
    endDate = endDate ?? metaRange.end ?? null
  }

  const timeEl = doc.querySelector('time[datetime]')
  const datetime = timeEl?.getAttribute('datetime')
  if (datetime) {
    startDate = startDate ?? parseYstmListMetadataDateValue(datetime)
    endDate = endDate ?? parseYstmListMetadataDateValue(datetime)
  }

  if (!title && !addressRaw && !startDate && !endDate && lat == null) {
    return { ok: false, reason: 'unparseable_detail' }
  }

  const imageUrls: string[] = []
  const seen = new Set<string>()
  for (const img of doc.querySelectorAll<HTMLImageElement>('img[src]')) {
    const src = img.getAttribute('src')?.trim()
    if (!src) continue
    try {
      const absolute = new URL(src, input.sourceUrl).href
      if (!seen.has(absolute)) {
        seen.add(absolute)
        imageUrls.push(absolute)
      }
    } catch {
      /* skip */
    }
  }

  return {
    ok: true,
    title,
    description,
    addressRaw,
    startDate,
    endDate,
    lat,
    lng,
    imageUrls,
  }
}
