import { createHash } from 'crypto'
import { JSDOM } from 'jsdom'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'
import { logger } from '@/lib/log'
import { resolveUsListStatePathSegment } from '@/lib/ingestion/adapters/usStateListPathSegment'
import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import {
  getYstmPathMunicipalityPreview,
  parseYstmListingPathParts,
  resolveYstmListingCityAuthority,
} from '@/lib/ingestion/ystmListingCityAuthority'
import type { GatedListingDiagnostics } from '@/lib/ingestion/address/addressGated'
import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import {
  addressLifecycleFieldsForDb,
  resolveIngestAddressLifecycle,
} from '@/lib/ingestion/address/resolveIngestAddressLifecycle'
import { enrichStreetLineWithPathMunicipalityWhenNoTail, slugSegmentToAddressLine } from '@/lib/ingestion/ystmAddressSlug'
import { normalizeIngestionCity } from '@/lib/ingestion/normalizeIngestionLocation'
import { urlSuggestsNonListingPhoto } from '@/lib/ingestion/nonSaleImageHeuristics'
import {
  emptyExternalDuplicateSkipCounts,
  isIngestedRowExpiredForDuplicate,
  type ExternalDuplicateSkipCounts,
} from '@/lib/ingestion/acquisition/duplicateSkipKinds'
import {
  bumpCrawlSkipSubReason,
  classifyDetailFirstFallbackSkip,
  classifyExistingUrlSkip,
  classifySoftDedupeListSkip,
  emptyExternalCrawlSkipSubReasonCounts,
  type ExternalCrawlSkipSubReason,
  type ExternalCrawlSkipSubReasonCounts,
} from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import {
  computeYstmSaleInstanceIdentity,
  saleInstanceIdentityDbColumns,
} from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import {
  classifySaleInstance,
  saleInstanceClassificationTelemetry,
} from '@/lib/ingestion/identity/classifySaleInstance'
import {
  listIngestedSalesBySourceUrl,
  pickPrimaryIngestedSaleBySourceUrl,
  type IngestedSaleSourceUrlLookupRow,
} from '@/lib/ingestion/identity/ingestedSaleSourceUrlLookup'
import { resolveIngestedSaleInsertCollision } from '@/lib/ingestion/identity/resolveIngestedSaleInsertCollision'
import {
  compareShadowSaleInstanceDecisions,
  shadowSaleInstanceTelemetry,
} from '@/lib/ingestion/identity/shadowSaleInstanceReplay'
import { recordIngestedSaleSourceUrl } from '@/lib/ingestion/identity/recordIngestedSaleSourceUrl'
import {
  isYstmSaleInstanceClassifierEnforcementEnabled,
  resolveYstmEnforcedExistingUrlCrawlAction,
} from '@/lib/ingestion/identity/ystmSaleInstanceClassifierEnforcement'
import {
  evaluatePostDetailEnrichedDuplicateSkip,
  parseYstmListRecrawlRefreshMaxPerPage,
  shouldDeferListSeedSoftDedupe,
  mustClassifyViaYstmDetailFirstBeforeUrlSkip,
  shouldQueueYstmListRecrawlRefresh,
} from '@/lib/ingestion/acquisition/detailFirstCrawlPolicy'
import { readYstmNativeCoordsFromListingRawPayload } from '@/lib/ingestion/acquisition/detailFirstNativeCoords'
import { detailScheduleFieldsForListing } from '@/lib/ingestion/acquisition/detailFirstFieldProvenance'
import { ingestedSaleTimeSourceForDb } from '@/lib/ingestion/ingestedSaleDbConstraints'
import { detailFirstOrchestrationFields } from '@/lib/ingestion/acquisition/detailFirstOrchestrationFields'
import { mergeListingImageUrlsIntoRowPayload } from '@/lib/ingestion/acquisition/mergeListingImageUrlsIntoRowPayload'
import {
  attemptYstmDetailFirstReady,
  emptyYstmDetailFirstRunMetrics,
  mapWithBoundedConcurrency,
  mergeYstmDetailFirstMetrics,
  parseYstmDetailFirstConcurrencyFromEnv,
  type YstmDetailFirstRunMetrics,
} from '@/lib/ingestion/acquisition/ystmDetailFirstReady'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { publishReadyIngestedSaleById } from '@/lib/ingestion/publishWorker'
import { isSaleWindowExpiredAtDiscovery } from '@/lib/ingestion/saleWindowDates'
import {
  lookupSpatialCoordinates,
  pageHtmlEligibleForYstmNative,
} from '@/lib/ingestion/spatial/resolveSpatialCoordinates'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

const ADAPTER_ID = 'external_page_source'
const PARSER_VERSION_ROW = 'external_page_source_mvp_v3'
const INGESTED_SALE_SOURCE_URL_SELECT =
  'id, status, failure_reasons, date_start, date_end, normalized_address, sale_instance_key, published_sale_id, superseded_by_ingested_sale_id, source_listing_id, source_content_hash, lat, lng, source_url'

function mapIngestedSaleSourceUrlRow(row: IngestedSaleSourceUrlLookupRow) {
  return {
    id: String(row.id),
    source_url: row.source_url ?? null,
    sale_instance_key: row.sale_instance_key ?? null,
    source_listing_id: row.source_listing_id ?? null,
    source_content_hash: row.source_content_hash ?? null,
    date_start: row.date_start ?? null,
    date_end: row.date_end ?? null,
    normalized_address: row.normalized_address ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    status: row.status ?? null,
    failure_reasons: row.failure_reasons,
    superseded_by_ingested_sale_id: row.superseded_by_ingested_sale_id ?? null,
  }
}

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
  imageSourceUrl: string | null
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
  /** Skipped insert: scored duplicate vs existing ingested row (same address window). */
  duplicateScoredSkipped: number
  /** Sale window already ended at crawl — not inserted (Phase 3A). */
  skippedExpired: number
  /** Inserts with non-expired sale window at discovery. */
  freshInserted: number
  duplicateExistingUrl: number
  duplicateCrossCityPage: number
  duplicateCanonicalCollision: number
  duplicateExpiredRow: number
  /** Phase 3B detail-first READY fast-path counters. */
  ystmDetailFirstAttempted: number
  ystmDetailFirstSucceeded: number
  ystmDetailFirstPublished: number
  ystmDetailFirstFallback: number
  ystmDetailFirstFetchFailed: number
  ystmDetailFirstReadyAtInsertRate: number | null
  ystmDetailFirstMedianMsToPublished: number | null
  ystmDetailFirstMsToPublishedSamples: number[]
  ystmDetailFirstFallbackByReason: Record<string, number>
  ystmDetailFirstTopFallbackReason: string | null
  ystmDetailFirstTopFallbackReasonPct: number | null
  detailFirstAddressFromDetailPage: number
  detailFirstAddressFromListSeed: number
  detailFirstAddressFromDetailPageRate: number | null
  ystmDetailFirstInsertFailedByDbCode: Record<string, number>
  /** Phase 6: existing YSTM detail URLs refreshed on list re-crawl (not duplicate-skipped). */
  ystmListRecrawlRefreshAttempted: number
  ystmListRecrawlRefreshSucceeded: number
  /** Phase 2: skip sub-reason counts for this config persist pass. */
  crawlSkipSubReasons: ExternalCrawlSkipSubReasonCounts
}

export type ExternalPageSourcePersistOptions = {
  beforePageFetch?: (params: {
    pageUrl: string
    pageIndex: number
    city: string
    state: string
  }) => Promise<void> | void
  /** Merged into structured telemetry (requestId, correlationId, etc.) — no PII. */
  telemetryContext?: Record<string, unknown>
}

/** HTTPS-only list URLs for server-side fetch (SSRF-safe layer). */
export function normalizeSourcePages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const u = item.trim()
    if (!/^https:\/\//i.test(u)) continue
    try {
      const parsed = new URL(u)
      if (parsed.protocol !== 'https:') continue
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
  function toIso(y: number, m: number, d: number): string | null {
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return `${y}-${pad2(m)}-${pad2(d)}`
  }

  const range = text.match(/(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})/)
  if (range) {
    const m1 = Number.parseInt(range[1], 10)
    const d1 = Number.parseInt(range[2], 10)
    const m2 = Number.parseInt(range[3], 10)
    const d2 = Number.parseInt(range[4], 10)
    const start = toIso(year, m1, d1)
    const end = toIso(year, m2, d2)
    if (start && end) {
      return { start, end }
    }
  }

  const single = text.match(/\b(\d{1,2})\/(\d{1,2})\b/)
  if (single) {
    const m = Number.parseInt(single[1], 10)
    const d = Number.parseInt(single[2], 10)
    const iso = toIso(year, m, d)
    if (iso) {
      return { start: iso, end: iso }
    }
  }

  const monthNames: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  }
  const monthNameRegex = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?/gi
  const found: string[] = []
  let mm: RegExpExecArray | null
  while ((mm = monthNameRegex.exec(text)) !== null) {
    const monKey = (mm[1] || '').toLowerCase().replace(/\.$/, '')
    const mon = monthNames[monKey]
    const day = Number.parseInt(mm[2] || '', 10)
    const y = mm[3] ? Number.parseInt(mm[3], 10) : year
    const iso = mon ? toIso(y, mon, day) : null
    if (iso && !found.includes(iso)) {
      found.push(iso)
    }
  }

  const compactMonthRange = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})(?:,\s*(\d{4}))?/i
  )
  if (compactMonthRange) {
    const monKey = (compactMonthRange[1] || '').toLowerCase().replace(/\.$/, '')
    const mon = monthNames[monKey]
    const d1 = Number.parseInt(compactMonthRange[2] || '', 10)
    const d2 = Number.parseInt(compactMonthRange[3] || '', 10)
    const y = compactMonthRange[4] ? Number.parseInt(compactMonthRange[4], 10) : year
    const start = mon ? toIso(y, mon, d1) : null
    const end = mon ? toIso(y, mon, d2) : null
    if (start && end) {
      return { start, end }
    }
  }
  if (found.length >= 2) {
    return { start: found[0], end: found[1] }
  }
  if (found.length === 1) {
    return { start: found[0], end: found[0] }
  }

  return {}
}

function epochSecondsToIsoDate(value: number): string | null {
  if (!Number.isFinite(value)) return null
  // Guard against tiny numbers that are unlikely to be unix epoch seconds.
  if (value < 946684800) return null // 2000-01-01
  const d = new Date(value * 1000)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  return `${y}-${pad2(m)}-${pad2(day)}`
}

function nativeCoordsForSoftDedupeProbe(
  listing: ExternalPageSourceListing
): { lat: number | null; lng: number | null } {
  const native = readYstmNativeCoordsFromListingRawPayload(listing.rawPayload)
  return { lat: native?.lat ?? null, lng: native?.lng ?? null }
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

export function extractFallbackAddressAndDates(
  fullText: string,
  city: string,
  state: string,
  rejectionSink?: AddressCandidateRejection[]
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
  // Accept numeric + alphanumeric civic numbers (e.g. "15W303", "N123W456", "100A").
  const addressRegex = /^\d[\dA-Za-z-]{0,8}\s+[A-Za-z0-9.'#\- ]{5,}/

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
      if (isObviouslyNonAddressLeadToken(line)) {
        rejectionSink?.push({ candidate: line, rejectionReason: 'non_address_time_lead' })
        continue
      }
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

function normalizeListingUrlForLookup(raw: string): string {
  try {
    const u = new URL(raw.trim())
    u.hash = ''
    return u.href
  } catch {
    return raw.trim()
  }
}

export type AddressCandidateRejection = { candidate: string; rejectionReason: string }

/**
 * True when the line opens with a time-of-day token (e.g. 10am, 9:30 am, 12:15pm), not a civic number.
 * Uses first 1–2 whitespace tokens only so values like "123 Main" are not flagged.
 */
export function isObviouslyNonAddressLeadToken(line: string): boolean {
  const s = line.replace(/\s+/g, ' ').trim()
  if (!s) return false
  const tokens = s.split(/\s+/).filter(Boolean)
  const t0 = tokens[0] ?? ''
  const t1 = tokens[1] ?? ''
  if (/^\d{1,2}(am|pm)$/i.test(t0)) return true
  if (/^\d{1,2}:\d{2}(am|pm)$/i.test(t0)) return true
  if (/^\d{1,2}:\d{2}:\d{2}(am|pm)$/i.test(t0)) return true
  if (/^\d{1,2}:\d{2}$/i.test(t0) && /^(am|pm)$/i.test(t1)) return true
  if (/^\d{1,2}:\d{2}:\d{2}$/i.test(t0) && /^(am|pm)$/i.test(t1)) return true
  if (/^\d{1,2}$/.test(t0) && /^(am|pm)$/i.test(t1)) return true
  return false
}

function extractAddressFromNearbyText(
  nearbyText: string,
  rejectionSink?: AddressCandidateRejection[]
): { address: string | null; nearbyCandidateCount: number } {
  const lines = nearbyText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (lines.length === 0) return { address: null, nearbyCandidateCount: 0 }

  const addressLike = /^\d[\dA-Za-z-]{0,8}\s+[A-Za-z0-9.'#\- ]{4,}/
  let nearbyCandidateCount = 0
  for (const line of lines) {
    const scrubbed = line
      .replace(/\bstreet view\b.*$/i, '')
      .replace(/\bdirections\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!scrubbed) continue
    if (addressLike.test(scrubbed) && !/(https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,})/i.test(scrubbed)) {
      nearbyCandidateCount += 1
      if (isObviouslyNonAddressLeadToken(scrubbed)) {
        rejectionSink?.push({ candidate: scrubbed, rejectionReason: 'non_address_time_lead' })
        continue
      }
      return { address: scrubbed, nearbyCandidateCount }
    }
  }
  return { address: null, nearbyCandidateCount }
}

function decodeJsSingleQuotedJson(raw: string): string {
  // Decode common JS single-quoted escapes used in inline metadata blobs.
  return raw
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
}

type MetadataSaleShape = {
  url?: unknown
  address?: unknown
  title?: unknown
  date?: unknown
  start_date?: unknown
  startDate?: unknown
  date_start?: unknown
  end_date?: unknown
  endDate?: unknown
  date_end?: unknown
  description?: unknown
  image?: unknown
  image_url?: unknown
  photo?: unknown
  photos?: unknown
  image_urls?: unknown
}
type MetadataSaleInfo = { address?: string; startDate?: string; endDate?: string; imageUrls?: string[] }

function parseMetadataDateValue(raw: unknown): string | null {
  if (typeof raw === 'number') return epochSecondsToIsoDate(raw)
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^\d{9,11}$/.test(trimmed)) {
    const epoch = Number.parseInt(trimmed, 10)
    return epochSecondsToIsoDate(epoch)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }
  const extracted = extractDateRangeFromText(trimmed)
  return extracted.start ?? null
}

function collectMetadataImageUrls(sale: MetadataSaleShape, pageUrl: string): string[] {
  const candidates: string[] = []
  const scalarFields = [sale.image, sale.image_url, sale.photo]
  for (const field of scalarFields) {
    if (typeof field === 'string') candidates.push(field)
  }
  const arrayFields = [sale.photos, sale.image_urls]
  for (const field of arrayFields) {
    if (!Array.isArray(field)) continue
    for (const item of field) {
      if (typeof item === 'string') candidates.push(item)
    }
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of candidates) {
    const normalized = normalizeAbsoluteHttpsUrl(raw, pageUrl)
    if (!normalized || shouldRejectImageUrl(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function extractListingMetadataFromScripts(document: Document, pageUrl: string): Map<string, MetadataSaleInfo> {
  const out = new Map<string, MetadataSaleInfo>()
  const scripts = Array.from(document.querySelectorAll('script'))

  for (const script of scripts) {
    const text = script.textContent || ''
    const m = text.match(/metadataStr\s*=\s*'([\s\S]*?)';/)
    if (!m?.[1]) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(decodeJsSingleQuotedJson(m[1]))
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue

    const sales = (parsed as { sales?: unknown }).sales
    if (!Array.isArray(sales)) continue

    for (const sale of sales as MetadataSaleShape[]) {
      const url = typeof sale?.url === 'string' ? normalizeListingUrlForLookup(sale.url) : null
      const address = typeof sale?.address === 'string' ? sale.address.replace(/\s+/g, ' ').trim() : null
      if (!url) continue
      const startFromFields = [
        sale?.date,
        sale?.start_date,
        sale?.startDate,
        sale?.date_start,
      ]
        .map(parseMetadataDateValue)
        .find((value): value is string => typeof value === 'string' && value.length > 0)
      const endFromFields = [
        sale?.end_date,
        sale?.endDate,
        sale?.date_end,
      ]
        .map(parseMetadataDateValue)
        .find((value): value is string => typeof value === 'string' && value.length > 0)
      const fromDescription =
        typeof sale?.description === 'string' ? extractDateRangeFromText(sale.description) : {}
      const fromTitle =
        typeof sale?.title === 'string' ? extractDateRangeFromText(sale.title) : {}
      const metadataImageUrls = collectMetadataImageUrls(sale, pageUrl)
      const info: MetadataSaleInfo = {
        ...(address ? { address } : {}),
        ...(startFromFields ? { startDate: startFromFields } : {}),
        ...(endFromFields ? { endDate: endFromFields } : {}),
        ...(metadataImageUrls.length > 0 ? { imageUrls: metadataImageUrls } : {}),
      }
      if (!info.startDate && fromTitle.start) info.startDate = fromTitle.start
      if (!info.endDate && fromTitle.end) info.endDate = fromTitle.end
      if (!info.startDate && fromDescription.start) info.startDate = fromDescription.start
      if (!info.endDate && fromDescription.end) info.endDate = fromDescription.end
      if (!info.startDate && info.endDate) info.startDate = info.endDate
      if (!info.endDate && info.startDate) info.endDate = info.startDate
      if (!info.address && !info.startDate && !info.endDate && !info.imageUrls) continue
      const externalId = externalIdFromListingUrl(url)
      if (externalId) {
        out.set(`id:${externalId}`, info)
      }
      out.set(`url:${url}`, info)
    }
  }

  return out
}

/**
 * Metadata sometimes repeats one `address` across many `sales[]` rows whose `url` paths imply
 * different municipalities. Treat that address string as untrusted for per-row `address_raw`.
 */
function collectUntrustedSharedMetadataAddressKeys(document: Document): Set<string> {
  const addrToMunis = new Map<string, Set<string>>()
  const scripts = Array.from(document.querySelectorAll('script'))

  for (const script of scripts) {
    const text = script.textContent || ''
    const m = text.match(/metadataStr\s*=\s*'([\s\S]*?)';/)
    if (!m?.[1]) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(decodeJsSingleQuotedJson(m[1]))
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue

    const sales = (parsed as { sales?: unknown }).sales
    if (!Array.isArray(sales)) continue

    for (const sale of sales as MetadataSaleShape[]) {
      const url = typeof sale?.url === 'string' ? normalizeListingUrlForLookup(sale.url) : null
      const address = typeof sale?.address === 'string' ? sale.address.replace(/\s+/g, ' ').trim() : null
      if (!url || !address) continue
      const preview = getYstmPathMunicipalityPreview(url)
      const muniKey = preview.city ? preview.city.toLowerCase() : ''
      if (!muniKey) continue
      const addrKey = address.toLowerCase()
      if (!addrToMunis.has(addrKey)) addrToMunis.set(addrKey, new Set())
      addrToMunis.get(addrKey)!.add(muniKey)
    }
  }

  const untrusted = new Set<string>()
  for (const [addrKey, set] of addrToMunis) {
    if (set.size > 1) untrusted.add(addrKey)
  }
  return untrusted
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

function normalizeAbsoluteHttpsUrl(raw: string, baseUrl: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed, baseUrl)
    if (url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function shouldRejectImageUrl(rawUrl: string): boolean {
  return urlSuggestsNonListingPhoto(rawUrl) != null
}

function collectImageUrlsNear(anchor: Element, baseUrl: string, max: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const imgAttrs = ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url']
  let el: Element | null = anchor
  for (let depth = 0; el && depth < 4 && out.length < max; depth++) {
    const imgs = el.querySelectorAll<HTMLImageElement>('img')
    for (const img of imgs) {
      for (const attr of imgAttrs) {
        const src = img.getAttribute(attr)?.trim()
        if (!src) continue
        const normalized = normalizeAbsoluteHttpsUrl(src, baseUrl)
        if (!normalized || shouldRejectImageUrl(normalized) || seen.has(normalized)) continue
        seen.add(normalized)
        out.push(normalized)
        if (out.length >= max) break
      }
      if (out.length >= max) break
      const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset')
      if (srcset) {
        const first = srcset.split(',')[0]?.trim().split(/\s+/)[0]
        if (first) {
          const normalized = normalizeAbsoluteHttpsUrl(first, baseUrl)
          if (normalized && !shouldRejectImageUrl(normalized) && !seen.has(normalized)) {
            seen.add(normalized)
            out.push(normalized)
          }
        }
      }
      if (out.length >= max) break
    }
    const bgEls = el.querySelectorAll<HTMLElement>("[style*='background-image']")
    for (const bgEl of bgEls) {
      const bg = bgEl.style.backgroundImage || ''
      const m = bg.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i)
      const rawBg = m?.[1]?.trim()
      if (!rawBg) continue
      const normalized = normalizeAbsoluteHttpsUrl(rawBg, baseUrl)
      if (!normalized || shouldRejectImageUrl(normalized) || seen.has(normalized)) continue
      seen.add(normalized)
      out.push(normalized)
      if (out.length >= max) break
    }
    if (out.length >= max) break
    el = el.parentElement
  }
  return out
}

function collectImageUrlsForListing(anchor: Element, document: Document, pageUrl: string, max: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  // Prefer listing-local content images first.
  for (const imageUrl of collectImageUrlsNear(anchor, pageUrl, max)) {
    if (seen.has(imageUrl)) continue
    seen.add(imageUrl)
    out.push(imageUrl)
    if (out.length >= max) break
  }

  if (out.length >= max) return out.slice(0, max)

  const ogImage = document
    .querySelector<HTMLMetaElement>('meta[property="og:image"], meta[name="og:image"]')
    ?.getAttribute('content')
  if (ogImage) {
    const normalizedOg = normalizeAbsoluteHttpsUrl(ogImage, pageUrl)
    if (normalizedOg && !shouldRejectImageUrl(normalizedOg) && !seen.has(normalizedOg)) {
      seen.add(normalizedOg)
      out.push(normalizedOg)
    }
  }
  return out.slice(0, max)
}

export function parseExternalPageSourceHtml(
  html: string,
  config: ExternalPageSourceIngestionConfig,
  pageUrl: string
): ParseExternalPageSourceResult {
  const normalizedHtml = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
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

  const dom = new JSDOM(normalizedHtml, { url: pageUrl })
  const { document } = dom.window
  const fullText = document.body?.textContent || ''
  const metadataByListing = extractListingMetadataFromScripts(document, pageUrl)
  const untrustedMetadataAddresses = collectUntrustedSharedMetadataAddressKeys(document)
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

    const pathInfo = parseYstmListingPathParts(href)
    if (!pathInfo) {
      invalid += 1
      continue
    }
    if (pathInfo.pathStateSegment?.toLowerCase() !== stateSegment.toLowerCase()) continue

    const addressSlug = pathInfo.addressSlugSegment
    const slugLine = addressSlug ? slugSegmentToAddressLine(addressSlug) : null
    let addressRaw = slugLine
    const slugWasPlaceholder = Boolean(addressSlug && !slugLine)
    let chosenAddressSource: 'slug' | 'nearby' | 'fallback' | 'metadata' | 'none' = slugLine ? 'slug' : 'none'
    const rejectedAddressCandidates: AddressCandidateRejection[] = []
    const addressSources: Array<'slug' | 'nearby' | 'fallback' | 'metadata' | 'slug_with_url_municipality'> = []
    if (addressRaw) addressSources.push('slug')

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
    const { address: nearbyAddress, nearbyCandidateCount } = extractAddressFromNearbyText(nearby, rejectedAddressCandidates)
    if (!addressRaw && nearbyAddress) {
      addressRaw = nearbyAddress
      addressSources.push('nearby')
      chosenAddressSource = 'nearby'
    }
    let { start: startDate, end: endDate } = extractDateRangeFromText(nearby)
    let imageUrls = collectImageUrlsForListing(a, document, pageUrl, MAX_IMPORTED_LISTING_IMAGES)

    // Fallback extraction when critical fields are missing from the primary parse.
    if (!addressRaw || !startDate) {
      const fallback = extractFallbackAddressAndDates(fullText, config.city, config.state, rejectedAddressCandidates)
      if (!addressRaw && fallback.address) {
        addressRaw = fallback.address
        addressSources.push('fallback')
        chosenAddressSource = 'fallback'
      }
      if (!startDate && fallback.start) {
        startDate = fallback.start
      }
      if (!endDate && fallback.end) {
        endDate = fallback.end
      }
    }

    const externalId = externalIdFromListingUrl(href)
    let metadataAddressSkippedAsUntrusted = false
    if (!addressRaw || !startDate || !endDate) {
      const normalizedHref = normalizeListingUrlForLookup(href)
      const byId = externalId ? metadataByListing.get(`id:${externalId}`) : null
      const byUrl = metadataByListing.get(`url:${normalizedHref}`) ?? null
      const meta = byId ?? byUrl
      if (meta) {
        const metaAddr = meta.address?.replace(/\s+/g, ' ').trim() ?? ''
        const metaTrusted =
          Boolean(metaAddr) &&
          !untrustedMetadataAddresses.has(metaAddr.toLowerCase())
        metadataAddressSkippedAsUntrusted = Boolean(metaAddr && !metaTrusted)
        if (!addressRaw && meta.address && metaTrusted) {
          addressRaw = meta.address
          addressSources.push('metadata')
          chosenAddressSource = 'metadata'
        }
        if (!startDate && meta.startDate) startDate = meta.startDate
        if (!endDate && meta.endDate) endDate = meta.endDate
        if (imageUrls.length === 0 && Array.isArray(meta.imageUrls) && meta.imageUrls.length > 0) {
          imageUrls = meta.imageUrls.slice(0, MAX_IMPORTED_LISTING_IMAGES)
        }
      }
    }

    const enriched = enrichStreetLineWithPathMunicipalityWhenNoTail(addressRaw, href)
    addressRaw = enriched.line
    if (enriched.appended) {
      addressSources.push('slug_with_url_municipality')
    }

    const authority = resolveYstmListingCityAuthority(href, addressRaw)
    if (!authority.resolvedCity || !authority.resolvedState) {
      invalid += 1
      continue
    }

    const resolvedCitySafe = normalizeIngestionCity(authority.resolvedCity) ?? authority.resolvedCity
    const description = cleanDescriptionText(
      nearby,
      addressRaw,
      resolvedCitySafe,
      authority.resolvedState
    )

    const rawPayload: Record<string, unknown> = {
      adapter: ADAPTER_ID,
      externalId,
      pathCitySlug: authority.pathCitySlug,
      hubSegment: authority.hubSegment,
      addressSlug: addressSlug ?? null,
      addressTailCity: authority.addressTailCity,
      cityConflict: authority.cityConflict,
      citySource: authority.citySource,
      stateSource: authority.stateSource,
      resolvedCity: resolvedCitySafe,
      resolvedState: authority.resolvedState,
      urlMunicipalityNormalized: authority.urlMunicipalityNormalized,
      ingestionDiagnostics: {
        addressSource: addressSources.length === 0 ? 'none' : addressSources.length === 1 ? addressSources[0] : 'composite',
        addressSources,
        chosenAddressSource,
        rejectedAddressCandidates,
        nearbyCandidateCount,
        slugWasPlaceholder,
        metadataAddressSkippedAsUntrusted,
        authority: {
          urlCity: authority.urlMunicipalityNormalized,
          addressTailCity: authority.addressTailCity,
          resolvedCity: resolvedCitySafe,
          citySource: authority.citySource,
          cityConflict: authority.cityConflict,
          streetConcrete: authority.streetConcrete,
        },
      },
    }
    if (imageUrls.length > 0) {
      rawPayload.imageUrls = imageUrls
    }

    listings.push({
      title,
      description,
      addressRaw,
      city: resolvedCitySafe,
      state: authority.resolvedState,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      sourceUrl: href,
      imageSourceUrl: imageUrls[0] ?? null,
      rawPayload,
    })
  }

  return { listings, invalid }
}

export async function fetchExternalPageSource(
  config: ExternalPageSourceIngestionConfig,
  pageUrl: string,
  pageIndex: number
): Promise<string> {
  return fetchSafeExternalPageHtml(pageUrl, {
    city: config.city,
    state: config.state,
    pageIndex,
    adapter: ADAPTER_ID,
  })
}

function buildRowRawPayload(
  listing: ExternalPageSourceListing,
  pageIndex: number,
  pageHostHash: string | null
): Record<string, unknown> {
  const rp = listing.rawPayload as {
    pathCitySlug?: unknown
    hubSegment?: unknown
    addressSlug?: unknown
    addressTailCity?: unknown
    cityConflict?: unknown
    externalId?: unknown
    citySource?: unknown
    stateSource?: unknown
    resolvedCity?: unknown
    resolvedState?: unknown
    urlMunicipalityNormalized?: unknown
    imageUrls?: unknown
    adapter?: unknown
    ingestionDiagnostics?: unknown
  }
  const out: Record<string, unknown> = {
    adapter: typeof rp.adapter === 'string' ? rp.adapter : ADAPTER_ID,
    parser_version: PARSER_VERSION_ROW,
    page_index: pageIndex,
    page_host_hash: pageHostHash,
    extractedFields: {
      pathCitySlug: rp.pathCitySlug ?? null,
      hubSegment: rp.hubSegment ?? null,
      addressSlug: rp.addressSlug ?? null,
      addressTailCity: rp.addressTailCity ?? null,
      cityConflict: typeof rp.cityConflict === 'boolean' ? rp.cityConflict : null,
      externalId: rp.externalId ?? null,
      citySource: rp.citySource ?? null,
      stateSource: rp.stateSource ?? null,
      resolvedCity: rp.resolvedCity ?? null,
      resolvedState: rp.resolvedState ?? null,
      urlMunicipalityNormalized: rp.urlMunicipalityNormalized ?? null,
      ingestionDiagnostics: rp.ingestionDiagnostics ?? null,
    },
  }
  if (Array.isArray(rp.imageUrls) && rp.imageUrls.length > 0) {
    out.imageUrls = rp.imageUrls
  }
  return out
}

export async function persistExternalPageSource(
  config: ExternalPageSourceIngestionConfig,
  options?: ExternalPageSourcePersistOptions
): Promise<ExternalPageSourcePersistSummary> {
  const summary: ExternalPageSourcePersistSummary = {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    invalid: 0,
    errors: 0,
    pagesProcessed: 0,
    duplicateScoredSkipped: 0,
    skippedExpired: 0,
    freshInserted: 0,
    duplicateExistingUrl: 0,
    duplicateCrossCityPage: 0,
    duplicateCanonicalCollision: 0,
    duplicateExpiredRow: 0,
    ystmDetailFirstAttempted: 0,
    ystmDetailFirstSucceeded: 0,
    ystmDetailFirstPublished: 0,
    ystmDetailFirstFallback: 0,
    ystmDetailFirstFetchFailed: 0,
    ystmDetailFirstReadyAtInsertRate: null,
    ystmDetailFirstMedianMsToPublished: null,
    ystmDetailFirstMsToPublishedSamples: [],
    ystmDetailFirstFallbackByReason: {},
    ystmDetailFirstTopFallbackReason: null,
    ystmDetailFirstTopFallbackReasonPct: null,
    detailFirstAddressFromDetailPage: 0,
    detailFirstAddressFromListSeed: 0,
    detailFirstAddressFromDetailPageRate: null,
    ystmDetailFirstInsertFailedByDbCode: {},
    ystmListRecrawlRefreshAttempted: 0,
    ystmListRecrawlRefreshSucceeded: 0,
    crawlSkipSubReasons: emptyExternalCrawlSkipSubReasonCounts(),
  }

  const detailFirstConcurrency = parseYstmDetailFirstConcurrencyFromEnv()
  const listRecrawlRefreshMaxPerPage = parseYstmListRecrawlRefreshMaxPerPage()
  const detailFirstMetrics: YstmDetailFirstRunMetrics = emptyYstmDetailFirstRunMetrics()

  const bumpDuplicateKind = (counts: ExternalDuplicateSkipCounts, kind: keyof ExternalDuplicateSkipCounts) => {
    counts[kind] += 1
    summary.skipped += 1
    if (kind === 'duplicate_existing_url') summary.duplicateExistingUrl += 1
    if (kind === 'duplicate_cross_city_page') summary.duplicateCrossCityPage += 1
    if (kind === 'duplicate_canonical_collision') summary.duplicateCanonicalCollision += 1
    if (kind === 'duplicate_expired_row') summary.duplicateExpiredRow += 1
  }
  const recordCrawlSkip = (reason: ExternalCrawlSkipSubReason, alsoCountAsListingSkip = true) => {
    bumpCrawlSkipSubReason(summary.crawlSkipSubReasons, reason)
    if (alsoCountAsListingSkip) {
      summary.skipped += 1
    }
  }
  const duplicateKinds = emptyExternalDuplicateSkipCounts()

  const telemBase = options?.telemetryContext ?? {}
  let parseDurationMsTotal = 0
  let duplicateUrlSkipped = 0
  let duplicateConstraintSkipped = 0
  let normalizationWarnings = 0

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

    if (options?.beforePageFetch) {
      try {
        await options.beforePageFetch({
          pageUrl,
          pageIndex,
          city: config.city,
          state: config.state,
        })
      } catch (e) {
        summary.errors += 1
        logger.warn('External page source: pre-fetch pacing hook failed', {
          component: 'ingestion/adapters/externalPageSource',
          operation: 'prefetch_hook',
          city: config.city,
          state: config.state,
          adapter: ADAPTER_ID,
          pageIndex,
          pageHostHash,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }

    let html: string
    try {
      html = await fetchExternalPageSource(config, pageUrl, pageIndex)
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
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.ingestion.externalFetchFailed, {
          ...telemBase,
          adapter: ADAPTER_ID,
          parserVersion: PARSER_VERSION_ROW,
          pageIndex,
          pageHostHash,
          errorCode: 'fetch_page',
        })
      )
      continue
    }

    let parseResult: ParseExternalPageSourceResult
    try {
      const parseStarted = Date.now()
      parseResult = parseExternalPageSourceHtml(html, config, pageUrl)
      parseDurationMsTotal += Date.now() - parseStarted
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
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.ingestion.externalParseFailed, {
          ...telemBase,
          adapter: ADAPTER_ID,
          parserVersion: PARSER_VERSION_ROW,
          pageIndex,
          pageHostHash,
          errorCode: 'parse_page',
        })
      )
      continue
    }

    summary.invalid += parseResult.invalid
    summary.fetched += parseResult.listings.length

    if (parseResult.listings.length === 0) {
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.ingestion.externalZeroListings, {
          ...telemBase,
          adapter: ADAPTER_ID,
          parserVersion: PARSER_VERSION_ROW,
          pageIndex,
          pageHostHash,
          invalidListingCount: parseResult.invalid,
        })
      )
    }

    type DetailFirstCandidate = {
      listing: ExternalPageSourceListing
      rowPayload: Record<string, unknown>
      existingIngestedSaleId?: string
    }
    const detailFirstCandidates: DetailFirstCandidate[] = []
    let listRecrawlRefreshesQueued = 0

    const insertListingLegacy = async (
      listing: ExternalPageSourceListing,
      rowPayload: Record<string, unknown>,
      detailPageHtml?: string | null
    ) => {
      const ingestDiag = (listing.rawPayload.ingestionDiagnostics ?? {}) as GatedListingDiagnostics & {
        chosenAddressSource?: string
      }
      const addressLifecycle = resolveIngestAddressLifecycle({
        sourceUrl: listing.sourceUrl,
        addressRaw: listing.addressRaw,
        wouldBeNeedsGeocode:
          isAddressGeocodeReady(listing.addressRaw) && Boolean(listing.startDate),
        diagnostics: {
          slugWasPlaceholder: ingestDiag.slugWasPlaceholder,
          chosenAddressSource: ingestDiag.chosenAddressSource,
        },
      })

      const normalizedLine = listing.addressRaw
        ? listing.addressRaw.toLowerCase().replace(/\s+/g, ' ')
        : null
      let insertStatus = addressLifecycle.ingestStatus
      let insertLat: number | null = null
      let insertLng: number | null = null
      const spatialInsertFields: Record<string, unknown> = {}

      if (
        insertStatus === 'needs_geocode' &&
        isAddressGeocodeReady(listing.addressRaw) &&
        listing.city?.trim() &&
        listing.state?.trim()
      ) {
        const nativeLookupHtml =
          detailPageHtml?.trim() && pageHtmlEligibleForYstmNative(listing.sourceUrl, detailPageHtml)
            ? detailPageHtml
            : pageHtmlEligibleForYstmNative(listing.sourceUrl, html)
              ? html
              : null
        const spatial = await lookupSpatialCoordinates({
          addressRaw: listing.addressRaw,
          normalizedAddress: normalizedLine,
          city: listing.city,
          state: listing.state,
          sourceUrl: listing.sourceUrl,
          pageHtml: nativeLookupHtml,
          telemetryContext: telemBase,
        })
        if (spatial) {
          insertLat = spatial.lat
          insertLng = spatial.lng
          insertStatus = 'ready'
          spatialInsertFields.geocode_confidence = spatial.geocode_confidence
          spatialInsertFields.coordinate_precision = spatial.coordinate_precision
          spatialInsertFields.geocode_method = spatial.geocode_method
        }
      }

      const scheduleFields = detailScheduleFieldsForListing(listing)
      const legacyRowPayload = mergeListingImageUrlsIntoRowPayload(
        {
          ...rowPayload,
          ...(typeof listing.rawPayload === 'object' &&
          listing.rawPayload &&
          (listing.rawPayload as { detailPageParsed?: boolean }).detailPageParsed
            ? { detailPageLegacyFallback: true, detailPageParsed: true }
            : {}),
        },
        listing
      )
      const saleInstanceIdentity = computeYstmSaleInstanceIdentity({
        sourcePlatform: platform,
        sourceUrl: listing.sourceUrl,
        state: listing.state,
        city: listing.city,
        normalizedAddress: normalizedLine,
        dateStart: listing.startDate ?? null,
        dateEnd: listing.endDate ?? null,
        timeStart: scheduleFields.time_start,
        timeEnd: scheduleFields.time_end,
        title: listing.title,
        description: listing.description,
        imageSourceUrl: listing.imageSourceUrl,
        lat: insertLat,
        lng: insertLng,
        rawPayload: legacyRowPayload,
      })

      const insertRow = {
        source_platform: platform,
        source_url: listing.sourceUrl,
        external_id: (listing.rawPayload.externalId as string | null) ?? null,
        title: listing.title,
        description: listing.description,
        address_raw: listing.addressRaw,
        normalized_address: normalizedLine,
        city: listing.city,
        state: listing.state,
        zip_code: null,
        lat: insertLat,
        lng: insertLng,
        date_start: listing.startDate ?? null,
        date_end: listing.endDate ?? null,
        time_start: scheduleFields.time_start,
        time_end: scheduleFields.time_end,
        date_source: scheduleFields.date_source,
        time_source: ingestedSaleTimeSourceForDb(scheduleFields.time_source),
        image_source_url: listing.imageSourceUrl,
        raw_text: null,
        raw_payload: legacyRowPayload,
        status: insertStatus,
        failure_reasons: [],
        parser_version: PARSER_VERSION_ROW,
        parse_confidence: insertStatus === 'needs_geocode' ? 'high' : 'low',
        is_duplicate: false,
        duplicate_of: null,
        ...addressLifecycleFieldsForDb(addressLifecycle),
        ...spatialInsertFields,
        ...saleInstanceIdentityDbColumns(saleInstanceIdentity),
      }

      const { data: insertedRow, error: insErr } = await fromBase(admin, 'ingested_sales')
        .insert(insertRow)
        .select('id')
        .maybeSingle()

      if (insErr) {
        if (/duplicate key|unique constraint|23505/i.test(insErr.message)) {
          const resolved = await resolveIngestedSaleInsertCollision(admin, {
            sourceUrl: listing.sourceUrl,
            row: insertRow,
          })
          if (resolved?.id) {
            if (insertStatus === 'ready') {
              await publishReadyIngestedSaleById(resolved.id)
            }
            await recordIngestedSaleSourceUrl(admin, {
              ingestedSaleId: resolved.id,
              sourcePlatform: platform,
              sourceUrl: listing.sourceUrl,
              sourceListingId: saleInstanceIdentity?.source_listing_id ?? null,
              payloadHash: saleInstanceIdentity?.source_payload_hash ?? null,
            })
            summary.inserted += 1
            summary.freshInserted += 1
            return
          }
          duplicateConstraintSkipped += 1
          bumpDuplicateKind(duplicateKinds, 'duplicate_canonical_collision')
          return
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
        return
      }

      if (insertedRow?.id && insertStatus === 'ready') {
        await publishReadyIngestedSaleById(String(insertedRow.id))
      }

      if (insertedRow?.id) {
        await recordIngestedSaleSourceUrl(admin, {
          ingestedSaleId: String(insertedRow.id),
          sourcePlatform: platform,
          sourceUrl: listing.sourceUrl,
          sourceListingId: saleInstanceIdentity?.source_listing_id ?? null,
          payloadHash: saleInstanceIdentity?.source_payload_hash ?? null,
        })
      }

      summary.inserted += 1
      summary.freshInserted += 1
    }

    for (const listing of parseResult.listings) {
      if ((listing.rawPayload as { cityConflict?: boolean }).cityConflict === true) {
        normalizationWarnings += 1
      }

      if (isSaleWindowExpiredAtDiscovery(listing.startDate, listing.endDate)) {
        summary.skippedExpired += 1
        recordCrawlSkip('url_match_expired_row')
        continue
      }

      const rowPayload = buildRowRawPayload(listing, pageIndex, pageHostHash)

      let urlHistoryRows: IngestedSaleSourceUrlLookupRow[] = []
      try {
        urlHistoryRows = await listIngestedSalesBySourceUrl(
          admin,
          listing.sourceUrl,
          INGESTED_SALE_SOURCE_URL_SELECT
        )
      } catch (selErr) {
        summary.errors += 1
        logger.error(
          'External page source: source_url lookup failed',
          selErr instanceof Error ? selErr : new Error(String(selErr)),
          {
            component: 'ingestion/adapters/externalPageSource',
            operation: 'dedupe_lookup',
            city: config.city,
            state: config.state,
            adapter: ADAPTER_ID,
            externalId: listing.rawPayload.externalId ?? null,
          }
        )
        emitObservabilityRecord(
          buildTelemetryRecord(ObservabilityEvents.parser.extractionFailure, {
            ...telemBase,
            adapter: ADAPTER_ID,
            parserVersion: PARSER_VERSION_ROW,
            pageIndex,
            pageHostHash,
            errorCode: 'dedupe_lookup',
          })
        )
        continue
      }

      const existing = pickPrimaryIngestedSaleBySourceUrl(urlHistoryRows)
      const existingUrlCandidates = urlHistoryRows.map(mapIngestedSaleSourceUrlRow)

      if (existing?.id) {
        if ((existing as { superseded_by_ingested_sale_id?: string | null }).superseded_by_ingested_sale_id) {
          duplicateUrlSkipped += 1
          bumpDuplicateKind(duplicateKinds, 'duplicate_existing_url')
          recordCrawlSkip('url_match_superseded_row', false)
          continue
        }

        await recordIngestedSaleSourceUrl(admin, {
          ingestedSaleId: String(existing.id),
          sourcePlatform: platform,
          sourceUrl: listing.sourceUrl,
        })

        const listNormalizedAddress =
          (existing as { normalized_address?: string | null }).normalized_address ??
          (listing.addressRaw
            ? listing.addressRaw.toLowerCase().replace(/\s+/g, ' ').trim()
            : null)
        const shadowComparison = compareShadowSaleInstanceDecisions(
          {
            sourcePlatform: platform,
            sourceUrl: listing.sourceUrl,
            state: listing.state,
            city: listing.city,
            normalizedAddress: listNormalizedAddress,
            dateStart: listing.startDate ?? null,
            dateEnd: listing.endDate ?? null,
          },
          {
            id: String(existing.id),
            source_url: listing.sourceUrl,
            status: existing.status as string,
            failure_reasons: existing.failure_reasons,
            date_start: (existing as { date_start?: string | null }).date_start ?? null,
            date_end: (existing as { date_end?: string | null }).date_end ?? null,
            normalized_address: listNormalizedAddress,
            lat: (existing as { lat?: number | null }).lat ?? null,
            lng: (existing as { lng?: number | null }).lng ?? null,
            source_listing_id:
              (existing as { source_listing_id?: string | null }).source_listing_id ?? null,
            sale_instance_key:
              (existing as { sale_instance_key?: string | null }).sale_instance_key ?? null,
            source_content_hash:
              (existing as { source_content_hash?: string | null }).source_content_hash ?? null,
            superseded_by_ingested_sale_id:
              (existing as { superseded_by_ingested_sale_id?: string | null })
                .superseded_by_ingested_sale_id ?? null,
          }
        )
        emitObservabilityRecord(
          buildTelemetryRecord(ObservabilityEvents.ingestion.saleInstanceShadowCompared, {
            ...telemBase,
            adapter: ADAPTER_ID,
            parserVersion: PARSER_VERSION_ROW,
            pageIndex,
            pageHostHash,
            phase: 'list_recrawl',
            ...shadowSaleInstanceTelemetry(shadowComparison),
          })
        )

        if (
          isYstmSaleInstanceClassifierEnforcementEnabled() &&
          mustClassifyViaYstmDetailFirstBeforeUrlSkip(listing.sourceUrl)
        ) {
          const enforced = resolveYstmEnforcedExistingUrlCrawlAction({
            sourcePlatform: platform,
            sourceUrl: listing.sourceUrl,
            state: listing.state,
            city: listing.city,
            normalizedAddress: listNormalizedAddress,
            dateStart: listing.startDate ?? null,
            dateEnd: listing.endDate ?? null,
            addressRaw: listing.addressRaw,
            title: listing.title,
            description: listing.description,
            existing: {
              id: String(existing.id),
              source_url: listing.sourceUrl,
              sale_instance_key:
                (existing as { sale_instance_key?: string | null }).sale_instance_key ?? null,
              source_listing_id:
                (existing as { source_listing_id?: string | null }).source_listing_id ?? null,
              source_content_hash:
                (existing as { source_content_hash?: string | null }).source_content_hash ?? null,
              date_start: (existing as { date_start?: string | null }).date_start ?? null,
              date_end: (existing as { date_end?: string | null }).date_end ?? null,
              normalized_address: listNormalizedAddress,
              status: existing.status as string,
              failure_reasons: existing.failure_reasons,
            },
            existingUrlCandidates,
          })
          emitObservabilityRecord(
            buildTelemetryRecord(ObservabilityEvents.ingestion.saleInstanceClassified, {
              ...telemBase,
              adapter: ADAPTER_ID,
              parserVersion: PARSER_VERSION_ROW,
              pageIndex,
              pageHostHash,
              phase: 'list_recrawl_classifier_enforce',
              classifierEnforced: true,
              ...saleInstanceClassificationTelemetry(enforced.classification),
            })
          )

          if (enforced.action.kind === 'queue_detail_first') {
            detailFirstCandidates.push({
              listing,
              rowPayload,
              existingIngestedSaleId: enforced.action.existingIngestedSaleId,
            })
            summary.ystmListRecrawlRefreshAttempted += 1
            recordCrawlSkip(enforced.action.crawlSkipSubReason, false)
            continue
          }

          duplicateUrlSkipped += 1
          bumpDuplicateKind(duplicateKinds, enforced.action.duplicateKind)
          recordCrawlSkip(enforced.action.crawlSkipSubReason, false)
          continue
        }

        const refreshDecision = shouldQueueYstmListRecrawlRefresh({
          sourcePlatform: platform,
          sourceUrl: listing.sourceUrl,
          state: listing.state,
          city: listing.city,
          existing: {
            id: String(existing.id),
            status: existing.status as string,
            failure_reasons: existing.failure_reasons,
            date_start: (existing as { date_start?: string | null }).date_start ?? null,
            date_end: (existing as { date_end?: string | null }).date_end ?? null,
            normalized_address:
              (existing as { normalized_address?: string | null }).normalized_address ?? null,
            sale_instance_key:
              (existing as { sale_instance_key?: string | null }).sale_instance_key ?? null,
            source_listing_id:
              (existing as { source_listing_id?: string | null }).source_listing_id ?? null,
            source_content_hash:
              (existing as { source_content_hash?: string | null }).source_content_hash ?? null,
          },
          listing: {
            startDate: listing.startDate,
            endDate: listing.endDate,
            addressRaw: listing.addressRaw,
          },
          refreshesQueued: listRecrawlRefreshesQueued,
          maxPerPage: listRecrawlRefreshMaxPerPage,
        })

        if (refreshDecision.queue) {
          const listClassification = classifySaleInstance({
            sourcePlatform: platform,
            sourceUrl: listing.sourceUrl,
            state: listing.state,
            city: listing.city,
            normalizedAddress:
              (existing as { normalized_address?: string | null }).normalized_address ?? null,
            dateStart: listing.startDate ?? null,
            dateEnd: listing.endDate ?? null,
            existingRowsBySourceUrl: existingUrlCandidates,
            existingRowsBySaleInstanceKey: [],
            existingRowsByAddressDate: [],
          })
          emitObservabilityRecord(
            buildTelemetryRecord(ObservabilityEvents.ingestion.saleInstanceClassified, {
              ...telemBase,
              adapter: ADAPTER_ID,
              parserVersion: PARSER_VERSION_ROW,
              pageIndex,
              pageHostHash,
              phase: 'list_recrawl',
              ...saleInstanceClassificationTelemetry(listClassification),
            })
          )

          detailFirstCandidates.push({
            listing,
            rowPayload,
            existingIngestedSaleId: String(existing.id),
          })
          if (!refreshDecision.priority) {
            listRecrawlRefreshesQueued += 1
          }
          summary.ystmListRecrawlRefreshAttempted += 1
          recordCrawlSkip(
            refreshDecision.priority ? 'url_match_dates_changed' : 'url_match_refresh_queued',
            false
          )
          continue
        }

        if (mustClassifyViaYstmDetailFirstBeforeUrlSkip(listing.sourceUrl)) {
          const gateClassification = classifySaleInstance({
            sourcePlatform: platform,
            sourceUrl: listing.sourceUrl,
            state: listing.state,
            city: listing.city,
            normalizedAddress:
              (existing as { normalized_address?: string | null }).normalized_address ?? null,
            dateStart: listing.startDate ?? null,
            dateEnd: listing.endDate ?? null,
            existingRowsBySourceUrl: existingUrlCandidates,
            existingRowsBySaleInstanceKey: [],
            existingRowsByAddressDate: [],
          })
          emitObservabilityRecord(
            buildTelemetryRecord(ObservabilityEvents.ingestion.saleInstanceClassified, {
              ...telemBase,
              adapter: ADAPTER_ID,
              parserVersion: PARSER_VERSION_ROW,
              pageIndex,
              pageHostHash,
              phase: 'list_recrawl_detail_first_gate',
              ...saleInstanceClassificationTelemetry(gateClassification),
            })
          )
          detailFirstCandidates.push({
            listing,
            rowPayload,
            existingIngestedSaleId: String(existing.id),
          })
          summary.ystmListRecrawlRefreshAttempted += 1
          recordCrawlSkip('url_match_refresh_queued', false)
          continue
        }

        duplicateUrlSkipped += 1
        const kind = isIngestedRowExpiredForDuplicate(
          existing.status as string,
          existing.failure_reasons
        )
          ? 'duplicate_expired_row'
          : 'duplicate_existing_url'
        bumpDuplicateKind(duplicateKinds, kind)
        const subReason = classifyExistingUrlSkip({
          listingStartDate: listing.startDate ?? null,
          listingEndDate: listing.endDate ?? null,
          listingAddressRaw: listing.addressRaw,
          existing: {
            status: existing.status as string,
            failure_reasons: existing.failure_reasons,
            date_start: (existing as { date_start?: string | null }).date_start ?? null,
            date_end: (existing as { date_end?: string | null }).date_end ?? null,
            normalized_address:
              (existing as { normalized_address?: string | null }).normalized_address ?? null,
          },
        })
        recordCrawlSkip(subReason, false)
        continue
      }

      if (!shouldDeferListSeedSoftDedupe(listing.sourceUrl)) {
        const listNativeCoords = nativeCoordsForSoftDedupeProbe(listing)
        const scoredDup = await evaluatePostDetailEnrichedDuplicateSkip(admin, platform, {
          title: listing.title,
          city: listing.city,
          state: listing.state,
          addressRaw: listing.addressRaw,
          startDate: listing.startDate ?? null,
          endDate: listing.endDate ?? null,
          externalId: (listing.rawPayload.externalId as string | null) ?? null,
          imageSourceUrl: listing.imageSourceUrl,
          sourceUrl: listing.sourceUrl,
          lat: listNativeCoords.lat,
          lng: listNativeCoords.lng,
        })
        if (scoredDup.skip) {
          summary.duplicateScoredSkipped += 1
          bumpDuplicateKind(duplicateKinds, scoredDup.skipKind ?? 'duplicate_cross_city_page')
          recordCrawlSkip(
            classifySoftDedupeListSkip(scoredDup.evaluation ?? { suppress: true }),
            false
          )
          continue
        }
      }

      if (isYstmDetailListingUrl(listing.sourceUrl)) {
        detailFirstCandidates.push({ listing, rowPayload })
        continue
      }

      await insertListingLegacy(listing, rowPayload)
    }

    if (detailFirstCandidates.length > 0) {
      await mapWithBoundedConcurrency(detailFirstCandidates, detailFirstConcurrency, async (candidate) => {
        const { result, metrics: attemptMetrics } = await attemptYstmDetailFirstReady({
          config,
          listSeed: candidate.listing,
          platform,
          rowPayload: candidate.rowPayload,
          pageIndex,
          existingIngestedSaleId: candidate.existingIngestedSaleId,
          telemetryContext: telemBase,
          beforeDetailFetch: options?.beforePageFetch
            ? async ({ detailUrl, pageIndex: detailPageIndex, city, state }) => {
                await options.beforePageFetch!({
                  pageUrl: detailUrl,
                  pageIndex: detailPageIndex,
                  city,
                  state,
                })
              }
            : undefined,
        })
        mergeYstmDetailFirstMetrics(detailFirstMetrics, attemptMetrics)

        if (result.outcome === 'ready') {
          if (candidate.existingIngestedSaleId) {
            summary.ystmListRecrawlRefreshSucceeded += 1
          } else {
            summary.inserted += 1
            summary.freshInserted += 1
          }
          return
        }

        if (candidate.existingIngestedSaleId) {
          return
        }

        const fallbackListing =
          result.outcome === 'fallback' && result.detailEnrichedListing
            ? result.detailEnrichedListing
            : candidate.listing
        const fallbackDetailHtml =
          result.outcome === 'fallback' ? result.detailPageHtml : undefined

        const fallbackNativeCoords = nativeCoordsForSoftDedupeProbe(fallbackListing)
        const postDetailDup = await evaluatePostDetailEnrichedDuplicateSkip(admin, platform, {
          title: fallbackListing.title,
          city: fallbackListing.city,
          state: fallbackListing.state,
          addressRaw: fallbackListing.addressRaw,
          startDate: fallbackListing.startDate ?? null,
          endDate: fallbackListing.endDate ?? null,
          externalId: (fallbackListing.rawPayload.externalId as string | null) ?? null,
          imageSourceUrl: fallbackListing.imageSourceUrl,
          sourceUrl: fallbackListing.sourceUrl,
          lat: fallbackNativeCoords.lat,
          lng: fallbackNativeCoords.lng,
        })
        if (postDetailDup.skip) {
          summary.duplicateScoredSkipped += 1
          bumpDuplicateKind(duplicateKinds, postDetailDup.skipKind ?? 'duplicate_cross_city_page')
          recordCrawlSkip(
            classifySoftDedupeListSkip(postDetailDup.evaluation ?? { suppress: true }),
            false
          )
          return
        }

        if (result.outcome === 'fallback' && result.reason) {
          recordCrawlSkip(classifyDetailFirstFallbackSkip(result.reason), false)
        }

        await insertListingLegacy(fallbackListing, candidate.rowPayload, fallbackDetailHtml)
      })
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
    duplicateScoredSkipped: summary.duplicateScoredSkipped,
    skippedExpired: summary.skippedExpired,
    freshInserted: summary.freshInserted,
    duplicateExistingUrl: summary.duplicateExistingUrl,
    duplicateCrossCityPage: summary.duplicateCrossCityPage,
    duplicateCanonicalCollision: summary.duplicateCanonicalCollision,
    duplicateExpiredRow: summary.duplicateExpiredRow,
  })

  const duplicateSuppressedTotal =
    duplicateUrlSkipped + duplicateConstraintSkipped + summary.duplicateScoredSkipped
  if (duplicateSuppressedTotal > 0) {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.parser.duplicateSuppressed, {
        ...telemBase,
        adapter: ADAPTER_ID,
        parserVersion: PARSER_VERSION_ROW,
        duplicateUrlSkipped,
        duplicateConstraintSkipped,
        duplicateScoredSkipped: summary.duplicateScoredSkipped,
        duplicateSuppressedTotal,
      })
    )
  }

  if (normalizationWarnings > 0) {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.parser.normalizationWarning, {
        ...telemBase,
        adapter: ADAPTER_ID,
        parserVersion: PARSER_VERSION_ROW,
        normalizationWarnings,
      })
    )
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.parser.parseTimed, {
      ...telemBase,
      adapter: ADAPTER_ID,
      parserVersion: PARSER_VERSION_ROW,
      parseDurationMsTotal,
      pagesProcessed: summary.pagesProcessed,
    })
  )

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.parser.persistComplete, {
      ...telemBase,
      adapter: ADAPTER_ID,
      parserVersion: PARSER_VERSION_ROW,
      pagesProcessed: summary.pagesProcessed,
      listingsExtracted: summary.fetched,
      inserted: summary.inserted,
      skipped: summary.skipped,
      invalid: summary.invalid,
      errors: summary.errors,
    })
  )

  summary.ystmDetailFirstAttempted = detailFirstMetrics.attempted
  summary.ystmDetailFirstSucceeded = detailFirstMetrics.succeeded
  summary.ystmDetailFirstPublished = detailFirstMetrics.published
  summary.ystmDetailFirstFallback = detailFirstMetrics.fallback
  summary.ystmDetailFirstFetchFailed = detailFirstMetrics.fetchFailed
  const detailFirstFields = detailFirstOrchestrationFields(detailFirstMetrics, summary.freshInserted)
  summary.ystmDetailFirstReadyAtInsertRate = detailFirstFields.freshInsertReadyAtInsertRate
  summary.ystmDetailFirstMedianMsToPublished = detailFirstFields.medianMsToPublished
  summary.ystmDetailFirstMsToPublishedSamples = [...detailFirstMetrics.msToPublishedSamples]
  summary.ystmDetailFirstFallbackByReason = { ...detailFirstFields.ystmDetailFirstFallbackByReason }
  summary.ystmDetailFirstTopFallbackReason = detailFirstFields.ystmDetailFirstTopFallbackReason
  summary.ystmDetailFirstTopFallbackReasonPct = detailFirstFields.ystmDetailFirstTopFallbackReasonPct
  summary.detailFirstAddressFromDetailPage = detailFirstFields.detailFirstAddressFromDetailPage
  summary.detailFirstAddressFromListSeed = detailFirstFields.detailFirstAddressFromListSeed
  summary.detailFirstAddressFromDetailPageRate = detailFirstFields.detailFirstAddressFromDetailPageRate
  summary.ystmDetailFirstInsertFailedByDbCode = {
    ...detailFirstFields.ystmDetailFirstInsertFailedByDbCode,
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.externalPersistSummary, {
      ...telemBase,
      adapter: ADAPTER_ID,
      parserVersion: PARSER_VERSION_ROW,
      sourcePlatform: platform,
      pagesProcessed: summary.pagesProcessed,
      listingsExtracted: summary.fetched,
      inserted: summary.inserted,
      skipped: summary.skipped,
      invalid: summary.invalid,
      errors: summary.errors,
      parseDurationMsTotal,
      duplicateUrlSkipped,
      duplicateConstraintSkipped,
      duplicateScoredSkipped: summary.duplicateScoredSkipped,
      skippedExpired: summary.skippedExpired,
      freshInserted: summary.freshInserted,
      duplicateExistingUrl: summary.duplicateExistingUrl,
      duplicateCrossCityPage: summary.duplicateCrossCityPage,
      duplicateCanonicalCollision: summary.duplicateCanonicalCollision,
      duplicateExpiredRow: summary.duplicateExpiredRow,
      ystmDetailFirstAttempted: summary.ystmDetailFirstAttempted,
      ystmDetailFirstSucceeded: summary.ystmDetailFirstSucceeded,
      ystmDetailFirstPublished: summary.ystmDetailFirstPublished,
      ystmDetailFirstFallback: summary.ystmDetailFirstFallback,
      ystmDetailFirstFetchFailed: summary.ystmDetailFirstFetchFailed,
      ystmListRecrawlRefreshAttempted: summary.ystmListRecrawlRefreshAttempted,
      ystmListRecrawlRefreshSucceeded: summary.ystmListRecrawlRefreshSucceeded,
      normalizationWarnings,
    })
  )

  return summary
}
