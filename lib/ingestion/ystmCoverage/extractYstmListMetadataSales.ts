import { createHash } from 'node:crypto'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { extractDateRangeFromText } from '@/lib/ingestion/adapters/externalPageSource'
import { isYstmIngestibleListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { parseYstmListMetadataDateValue } from '@/lib/ingestion/ystmCoverage/ystmListMetadataDate'

export type YstmListMetadataSale = {
  canonicalUrl: string
  sourceUrl: string
  title: string | null
  description: string | null
  address: string | null
  lat: number | null
  lng: number | null
  startDate: string | null
  endDate: string | null
  postedAt: string | null
  imageUrls: string[]
}

type MetadataSaleShape = {
  url?: unknown
  sale_url?: unknown
  title?: unknown
  description?: unknown
  address?: unknown
  lat?: unknown
  lng?: unknown
  latitude?: unknown
  longitude?: unknown
  date?: unknown
  start_date?: unknown
  startDate?: unknown
  date_start?: unknown
  end_date?: unknown
  endDate?: unknown
  date_end?: unknown
  posted_at?: unknown
  postedAt?: unknown
  image?: unknown
  image_url?: unknown
  photo?: unknown
  photos?: unknown
  image_urls?: unknown
}

function decodeJsSingleQuotedJson(raw: string): string {
  return raw
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
}

function readCoord(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseFloat(raw.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

function collectImageUrls(sale: MetadataSaleShape, pageUrl: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    try {
      const absolute = new URL(raw.trim(), pageUrl).href
      if (!seen.has(absolute)) {
        seen.add(absolute)
        out.push(absolute)
      }
    } catch {
      /* skip */
    }
  }
  for (const field of [sale.image, sale.image_url, sale.photo]) {
    if (typeof field === 'string' && field.trim()) push(field)
  }
  for (const arr of [sale.photos, sale.image_urls]) {
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      if (typeof item === 'string' && item.trim()) push(item)
    }
  }
  return out
}

function resolveDates(sale: MetadataSaleShape): { startDate: string | null; endDate: string | null } {
  const startFromFields = [
    sale.date,
    sale.start_date,
    sale.startDate,
    sale.date_start,
  ]
    .map(parseYstmListMetadataDateValue)
    .find((v): v is string => Boolean(v)) ?? null

  const endFromFields = [sale.end_date, sale.endDate, sale.date_end]
    .map(parseYstmListMetadataDateValue)
    .find((v): v is string => Boolean(v)) ?? null

  const fromDescription =
    typeof sale.description === 'string' ? extractDateRangeFromText(sale.description) : {}
  const fromTitle = typeof sale.title === 'string' ? extractDateRangeFromText(sale.title) : {}

  let startDate = startFromFields ?? fromTitle.start ?? fromDescription.start ?? null
  let endDate = endFromFields ?? fromTitle.end ?? fromDescription.end ?? null
  if (!startDate && endDate) startDate = endDate
  if (!endDate && startDate) endDate = startDate
  return { startDate, endDate }
}

function saleRowToMetadata(
  sale: MetadataSaleShape,
  pageUrl: string,
  seen: Set<string>,
  out: YstmListMetadataSale[]
): void {
  const rawUrl =
    typeof sale.url === 'string'
      ? sale.url
      : typeof sale.sale_url === 'string'
        ? sale.sale_url
        : null
  if (!rawUrl?.trim()) return

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

  const title = typeof sale.title === 'string' ? sale.title.replace(/\s+/g, ' ').trim() || null : null
  const description =
    typeof sale.description === 'string' ? sale.description.replace(/\s+/g, ' ').trim() || null : null
  const address =
    typeof sale.address === 'string' ? sale.address.replace(/\s+/g, ' ').trim() || null : null
  const lat = readCoord(sale.lat) ?? readCoord(sale.latitude)
  const lng = readCoord(sale.lng) ?? readCoord(sale.longitude)
  const { startDate, endDate } = resolveDates(sale)
  const postedRaw = sale.posted_at ?? sale.postedAt
  const postedAt =
    typeof postedRaw === 'string' && postedRaw.trim()
      ? postedRaw.trim()
      : typeof postedRaw === 'number'
        ? new Date(postedRaw > 1_000_000_000_000 ? postedRaw : postedRaw * 1000).toISOString()
        : null

  out.push({
    canonicalUrl: canonical,
    sourceUrl: absolute,
    title,
    description,
    address,
    lat,
    lng,
    startDate,
    endDate,
    postedAt,
    imageUrls: collectImageUrls(sale, pageUrl),
  })
}

/**
 * Extract full metadataStr sale rows from a YSTM city list page.
 */
export function extractYstmListMetadataSales(html: string, pageUrl: string): YstmListMetadataSale[] {
  const normalized = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return []

  const seen = new Set<string>()
  const out: YstmListMetadataSale[] = []
  const re = /metadataStr\s*=\s*'([\s\S]*?)';/g
  let match: RegExpExecArray | null
  while ((match = re.exec(normalized)) !== null) {
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
      saleRowToMetadata(sale as MetadataSaleShape, pageUrl, seen, out)
    }
  }

  return out
}

export function hashYstmListMetadataSnapshot(snapshot: YstmListMetadataSale): string {
  return createHash('sha256').update(JSON.stringify(snapshot), 'utf8').digest('hex')
}
