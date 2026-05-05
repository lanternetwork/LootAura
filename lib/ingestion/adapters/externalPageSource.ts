import { createHash } from 'crypto'
import { JSDOM } from 'jsdom'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { resolveUsListStatePathSegment } from '@/lib/ingestion/adapters/usStateListPathSegment'

const ADAPTER_ID = 'external_page_source'
const PARSER_VERSION_ROW = 'external_page_source_mvp_v2'

export interface ExternalPageSourceIngestionConfig {
  city: string
  state: string
  source_platform: string
  /** JSON array from DB; normalized by `normalizeSourcePages`. */
  source_pages: unknown
}

export interface ExternalPageSourceListing {
  title: string
  description: string | null
  addressRaw: string | null
  city: string
  state: string
  startDate?: string
  endDate?: string
  sourceUrl: string
  /** Listing-level fields only; persist merges page metadata before insert. */
  rawPayload: Record<string, unknown>
}

export interface ParseExternalPageSourceResult {
  listings: ExternalPageSourceListing[]
  invalid: number
}

export interface ExternalPageSourcePersistSummary {
  fetched: number
  inserted: number
  skipped: number
  invalid: number
  errors: number
  pagesProcessed: number
}

export function normalizeSourcePages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const u = item.trim()
    if (!/^https?:\/\//i.test(u)) continue
    try {
      const parsed = new URL(u)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    } catch {
      continue
    }
    out.push(u)
  }
  return out
}

function hashPageHostname(pageUrl: string): string | null {
  try {
    const host = new URL(pageUrl).hostname
    return createHash('sha256').update(host).digest('hex').slice(0, 16)
  } catch {
    return null
  }
}

function slugSegmentToAddressRaw(segment: string): string | null {
  const decoded = decodeURIComponent(segment).trim()
  if (!decoded) return null
  if (/^see-source-for-address/i.test(decoded)) {
    return null
  }
  return decoded.replace(/-/g, ' ')
}

function externalIdFromListingUrl(url: string): string | null {
  const m = url.match(/\/(\d+)\/(?:listing|userlisting)\.html/i)
  return m?.[1] ?? null
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function extractDateRangeFromText(text: string): { start?: string; end?: string } {
  // Keep date values as pure YYYY-MM-DD strings; no Date object conversion to avoid timezone drift.
  const year = new Date().getUTCFullYear()
  const range = text.match(/(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})/)
  if (range) {
    const m1 = Number.parseInt(range[1], 10)
    const d1 = Number.parseInt(range[2], 10)
    const m2 = Number.parseInt(range[3], 10)
    const d2 = Number.parseInt(range[4], 10)
    if (
      [m1, d1, m2, d2].every((x) => Number.isFinite(x) && x > 0) &&
      m1 <= 12 &&
      m2 <= 12
    ) {
      return {
        start: `${year}-${pad2(m1)}-${pad2(d1)}`,
        end: `${year}-${pad2(m2)}-${pad2(d2)}`,
      }
    }
  }
  const single = text.match(/\b(\d{1,2})\/(\d{1,2})\b/)
  if (single) {
    const m = Number.parseInt(single[1], 10)
    const d = Number.parseInt(single[2], 10)
    if (Number.isFinite(m) && Number.isFinite(d) && m > 0 && m <= 12 && d > 0 && d <= 31) {
      const iso = `${year}-${pad2(m)}-${pad2(d)}`
      return { start: iso, end: iso }
    }
  }
  return {}
}

function cleanDescriptionText(
  nearbyText: string,
  addressRaw: string | null,
  city: string,
  state: string
): string | null {
  const addressParts = [addressRaw, city, state]
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .map((v) => v.toLowerCase())

  const lines = nearbyText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !/street view|directions|source:/i.test(line))
    .filter((line) => !/(https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,})/i.test(line))
    .filter((line) => {
      const lower = line.toLowerCase()
      if (addressParts.length === 0) return true
      // Drop lines that are primarily the address/location string.
      return !addressParts.every((part) => lower.includes(part))
    })

  const joined = lines.join('\n').trim()
  if (!joined) return null

  // Remove embedded address fragments from remaining text.
  let cleaned = joined
  if (addressRaw) {
    const escaped = addressRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '')
  }
  const cityState = [city, state].map((v) => v.trim()).filter(Boolean).join(', ')
  if (cityState) {
    const escaped = cityState.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '')
  }
  cleaned = cleaned.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return cleaned || null
}

function extractFallbackAddressAndDates(
  fullText: string,
  city: string,
  state: string
): { address?: string; start?: string; end?: string } {
  const lines = fullText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  if (lines.length === 0) return {}

  const dateCandidates: { index: number; start?: string; end?: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const { start, end } = extractDateRangeFromText(lines[i])
    if (start || end) {
      dateCandidates.push({ index: i, start, end })
    }
  }

  // Broad real-world address match:
  // - starts with a street number
  // - has enough trailing characters/words to look like a street line
  // - does NOT depend on a suffix like Ave/St/etc
  const addressRegex = /^\d{3,6}\s+[A-Za-z0-9.'\- ]{5,}/

  function isAddressNoiseLine(line: string): boolean {
    return (
      /street view|directions|source:/i.test(line) ||
      /(https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,})/i.test(line)
    )
  }

  function isInvalidAddressLikeLine(line: string): boolean {
    const words = line.match(/[A-Za-z]+/g) ?? []
    const hasAllCapsLongPhrase =
      words.length >= 4 && words.every((word) => word.length <= 1 || word === word.toUpperCase())
    if (hasAllCapsLongPhrase) return true
    if (/\b(SALE|EVENT|HUGE|MOVING|ESTATE)\b/i.test(line)) return true
    return false
  }

  function scoreAddressCandidate(line: string): number {
    let score = 0
    const cityLower = city.trim().toLowerCase()
    const stateLower = state.trim().toLowerCase()
    const lineLower = line.toLowerCase()
    if (line.includes(',')) score += 2
    if (/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/i.test(line)) {
      score += 1
    }
    if ((cityLower && lineLower.includes(cityLower)) || (stateLower && lineLower.includes(stateLower))) {
      score += 1
    }
    if (/\b(ave|avenue|st|street|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place|way|pkwy|parkway)\b/i.test(line)) {
      score += 1
    }
    const noNumber = line.replace(/^\d{3,6}\s+/, '').trim()
    const trailingWords = noNumber.match(/[A-Za-z0-9.'-]+/g) ?? []
    const hasCapitalized = /\b[A-Z][a-zA-Z0-9.'-]*\b/.test(noNumber)
    if (trailingWords.length >= 2 && hasCapitalized) score += 1
    return score
  }

  const addressCandidates: { index: number; line: string; score: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isAddressNoiseLine(line)) continue
    if (isInvalidAddressLikeLine(line)) continue
    if (addressRegex.test(line)) {
      addressCandidates.push({ index: i, line, score: scoreAddressCandidate(line) })
    }
  }

  function findAddressNear(index: number): string | undefined {
    const windowSize = 4
    let best: { line: string; score: number } | undefined
    for (const candidate of addressCandidates) {
      if (Math.abs(candidate.index - index) <= windowSize) {
        if (!best || candidate.score > best.score) {
          best = { line: candidate.line, score: candidate.score }
        }
      }
    }
    return best?.line
  }

  // Prefer address/date pairs that appear near each other.
  for (const candidate of dateCandidates) {
    const addr = findAddressNear(candidate.index)
    if (addr) {
      return { address: addr, start: candidate.start, end: candidate.end }
    }
  }

  // Independent fallback: select best candidates even if not adjacent.
  const bestAddress = [...addressCandidates].sort((a, b) => b.score - a.score)[0]?.line
  const bestDate = dateCandidates[0]
  if (!bestAddress && !bestDate) return {}

  return { address: bestAddress, start: bestDate?.start, end: bestDate?.end }
}

function collectNearbyText(anchor: Element, maxDepth: number): string {
  const parts: string[] = []
  let el: Element | null = anchor
  for (let depth = 0; el && depth < maxDepth; depth++) {
    const p: Element | null = el.parentElement
    if (!p) break
    parts.push(p.textContent || '')
    el = p
  }
  return parts.join('\n').slice(0, 2000)
}

function collectImageUrlsNear(anchor: Element, max: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let el: Element | null = anchor
  for (let depth = 0; el && depth < 4 && out.length < max; depth++) {
    const imgs = el.querySelectorAll<HTMLImageElement>('img[src]')
    for (const img of imgs) {
      const src = img.getAttribute('src')?.trim()
      if (!src || !/^https?:\/\//i.test(src)) continue
      if (seen.has(src)) continue
      seen.add(src)
      out.push(src)
      if (out.length >= max) break
    }
    el = el.parentElement
  }
  return out
}

export function parseExternalPageSourceHtml(
  html: string,
  config: ExternalPageSourceIngestionConfig,
  pageUrl: string
): ParseExternalPageSourceResult {
  const stateSegment = resolveUsListStatePathSegment(config.state)
  if (!stateSegment) {
    logger.warn('External page source: unknown state for list path filter', {
      component: 'ingestion/adapters/externalPageSource',
      operation: 'parse',
      city: config.city,
      state: config.state,
      adapter: ADAPTER_ID,
    })
    return { listings: [], invalid: 0 }
  }

  const dom = new JSDOM(html, { url: pageUrl })
  const { document } = dom.window
  const fullText = document.body?.textContent || ''
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="listing.html"], a[href*="userlisting.html"]'
  )
  const seen = new Set<string>()
  const listings: ExternalPageSourceListing[] = []
  let invalid = 0

  for (const a of anchors) {
    const href = a.href?.trim()
    if (!href || !/^https?:\/\//i.test(href)) continue
    if (!/\/(?:listing|userlisting)\.html/i.test(href)) continue
    if (seen.has(href)) continue
    seen.add(href)

    let urlObj: URL
    try {
      urlObj = new URL(href)
    } catch {
      invalid += 1
      continue
    }
    const parts = urlObj.pathname.split('/').filter(Boolean)
    if (parts.length < 6 || parts[0] !== 'US') continue
    if (parts[1].toLowerCase() !== stateSegment.toLowerCase()) continue

    const addressSlug = parts[3]
    let addressRaw = addressSlug ? slugSegmentToAddressRaw(addressSlug) : null

    let title = (a.textContent || '').replace(/\s+/g, ' ').trim()
    title = title.replace(/[\u200b\s]+$/g, '').replace(/^[\s\u200b]+/g, '')
    if (!title) {
      title = addressRaw ? addressRaw.trim() : ''
    }
    if (!title.trim() && addressRaw == null) {
      invalid += 1
      continue
    }
    if (!title.trim()) {
      title = 'Listing'
    }

    const nearby = collectNearbyText(a, 4)
    let { start: startDate, end: endDate } = extractDateRangeFromText(nearby)
    const description = cleanDescriptionText(nearby, addressRaw, config.city, config.state)
    const imageUrls = collectImageUrlsNear(a, 8)

    // Fallback extraction when critical fields are missing from the primary parse.
    if (!addressRaw || !startDate) {
      const fallback = extractFallbackAddressAndDates(fullText, config.city, config.state)
      if (!addressRaw && fallback.address) {
        addressRaw = fallback.address
      }
      if (!startDate && fallback.start) {
        startDate = fallback.start
      }
      if (!endDate && fallback.end) {
        endDate = fallback.end
      }
    }

    const externalId = externalIdFromListingUrl(href)
    const rawPayload: Record<string, unknown> = {
      adapter: ADAPTER_ID,
      externalId,
      pathCitySlug: parts[2],
      addressSlug: addressSlug ?? null,
    }
    if (imageUrls.length > 0) {
      rawPayload.imageUrls = imageUrls
    }

    listings.push({
      title,
      description,
      addressRaw,
      city: config.city,
      state: config.state,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      sourceUrl: href,
      rawPayload,
    })
  }

  return { listings, invalid }
}

export async function fetchExternalPageSource(
  _config: ExternalPageSourceIngestionConfig,
  pageUrl: string
): Promise<string> {
  const res = await fetch(pageUrl, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (compatible; LootAura/1.0; +https://lootaura.com) AppleWebKit/537.36 (KHTML, like Gecko)',
    },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.text()
}

function buildRowRawPayload(
  listing: ExternalPageSourceListing,
  pageIndex: number,
  pageHostHash: string | null
): Record<string, unknown> {
  const rp = listing.rawPayload as {
    pathCitySlug?: unknown
    addressSlug?: unknown
    externalId?: unknown
    imageUrls?: unknown
    adapter?: unknown
  }
  const out: Record<string, unknown> = {
    adapter: typeof rp.adapter === 'string' ? rp.adapter : ADAPTER_ID,
    parser_version: PARSER_VERSION_ROW,
    page_index: pageIndex,
    page_host_hash: pageHostHash,
    extractedFields: {
      pathCitySlug: rp.pathCitySlug ?? null,
      addressSlug: rp.addressSlug ?? null,
      externalId: rp.externalId ?? null,
    },
  }
  if (Array.isArray(rp.imageUrls) && rp.imageUrls.length > 0) {
    out.imageUrls = rp.imageUrls
  }
  return out
}

export async function persistExternalPageSource(
  config: ExternalPageSourceIngestionConfig
): Promise<ExternalPageSourcePersistSummary> {
  const summary: ExternalPageSourcePersistSummary = {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    invalid: 0,
    errors: 0,
    pagesProcessed: 0,
  }

  const pages = normalizeSourcePages(config.source_pages)
  if (pages.length === 0) {
    return summary
  }

  const admin = getAdminDb()
  const platform = config.source_platform || ADAPTER_ID

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageUrl = pages[pageIndex]
    summary.pagesProcessed += 1
    const pageHostHash = hashPageHostname(pageUrl)

    let html: string
    try {
      html = await fetchExternalPageSource(config, pageUrl)
    } catch (e) {
      summary.errors += 1
      logger.warn('External page source: page fetch failed', {
        component: 'ingestion/adapters/externalPageSource',
        operation: 'fetch_page',
        city: config.city,
        state: config.state,
        adapter: ADAPTER_ID,
        pageIndex,
        pageHostHash,
        message: e instanceof Error ? e.message : String(e),
      })
      continue
    }

    let parseResult: ParseExternalPageSourceResult
    try {
      parseResult = parseExternalPageSourceHtml(html, config, pageUrl)
    } catch (e) {
      summary.errors += 1
      logger.warn('External page source: parse failed', {
        component: 'ingestion/adapters/externalPageSource',
        operation: 'parse_page',
        city: config.city,
        state: config.state,
        adapter: ADAPTER_ID,
        pageIndex,
        pageHostHash,
        message: e instanceof Error ? e.message : String(e),
      })
      continue
    }

    summary.invalid += parseResult.invalid
    summary.fetched += parseResult.listings.length

    for (const listing of parseResult.listings) {
      const rowPayload = buildRowRawPayload(listing, pageIndex, pageHostHash)

      const { data: existing, error: selErr } = await fromBase(admin, 'ingested_sales')
        .select('id')
        .eq('source_url', listing.sourceUrl)
        .maybeSingle()

      if (selErr) {
        summary.errors += 1
        logger.error(
          'External page source: source_url lookup failed',
          new Error(selErr.message),
          {
            component: 'ingestion/adapters/externalPageSource',
            operation: 'dedupe_lookup',
            city: config.city,
            state: config.state,
            adapter: ADAPTER_ID,
            externalId: listing.rawPayload.externalId ?? null,
          }
        )
        continue
      }
      if (existing?.id) {
        summary.skipped += 1
        continue
      }

      const { error: insErr } = await fromBase(admin, 'ingested_sales').insert({
        source_platform: platform,
        source_url: listing.sourceUrl,
        external_id: (listing.rawPayload.externalId as string | null) ?? null,
        title: listing.title,
        description: listing.description,
        address_raw: listing.addressRaw,
        normalized_address: null,
        city: listing.city,
        state: listing.state,
        zip_code: null,
        lat: null,
        lng: null,
        date_start: listing.startDate ?? null,
        date_end: listing.endDate ?? null,
        time_start: null,
        time_end: null,
        date_source: listing.startDate ? 'external_list_page' : null,
        time_source: null,
        image_source_url: null,
        raw_text: null,
        raw_payload: rowPayload,
        status: 'needs_geocode',
        failure_reasons: [],
        parser_version: PARSER_VERSION_ROW,
        parse_confidence: 'low',
        is_duplicate: false,
        duplicate_of: null,
      })

      if (insErr) {
        if (/duplicate key|unique constraint|23505/i.test(insErr.message)) {
          summary.skipped += 1
          continue
        }
        summary.errors += 1
        logger.error(
          'External page source: insert failed',
          new Error(insErr.message),
          {
            component: 'ingestion/adapters/externalPageSource',
            operation: 'insert',
            city: config.city,
            state: config.state,
            adapter: ADAPTER_ID,
            externalId: listing.rawPayload.externalId ?? null,
          }
        )
        continue
      }
      summary.inserted += 1
    }
  }

  logger.info('External page source config ingest', {
    component: 'ingestion/adapters/externalPageSource',
    operation: 'persist_config_complete',
    city: config.city,
    state: config.state,
    adapter: ADAPTER_ID,
    fetched: summary.fetched,
    inserted: summary.inserted,
    skipped: summary.skipped,
    invalid: summary.invalid,
    errors: summary.errors,
    pagesProcessed: summary.pagesProcessed,
  })

  return summary
}
