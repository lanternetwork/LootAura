/**
 * Tier 0 deterministic duplicate scoring for ingested_sales soft matches.
 *
 * Audit snapshot (see also `dedupe.ts`):
 * - Dedupe identifiers: `source_url` (exact), `normalized_address` + `date_start` (exact),
 *   then same `normalized_address` with `date_start` within ±1 day (legacy soft window).
 * - Address/title: `normalized_address` is lowercased single-spaced raw address on insert;
 *   upload path did not previously pass title into dedupe (now optional via context).
 * - Source uniqueness: per-row `source_url` unique in practice; external_page_source skips
 *   on existing `source_url` before insert.
 * - Prior weak spot: soft match used `.find()` on up to 50 unordered rows → nondeterministic
 *   winner when multiple ±1-day neighbors exist; generic titles could false-positive.
 *
 * This module is pure (no I/O): stable ordering, integer scores, explicit thresholds.
 */

/** How far out we fetch same-address rows for scoring (inclusive day radius). */
export const SOFT_CANDIDATE_FETCH_DAY_RADIUS = 3

/** Legacy ±1 calendar-day window used inside scoring for “same weekend” boost. */
export const SOFT_DATE_OVERLAP_CALENDAR_DAY_RADIUS = 1

/** Minimum total score to treat a soft match as a duplicate (suppress / skip insert). */
export const SOFT_SUPPRESS_MIN_SCORE = 70

/** Stronger bar when the incoming title is generic (“Garage Sale”, etc.). */
export const SOFT_SUPPRESS_MIN_SCORE_GENERIC_TITLE = 85

/** Stronger bar when the normalized address looks like a weak template (apt/unit, very short). */
export const SOFT_SUPPRESS_MIN_SCORE_WEAK_ADDRESS = 90

/** Haversine distance under which we add a small geo bonus (meters). */
export const DUPLICATE_GEO_MATCH_MAX_METERS = 120

const GENERIC_TITLE_EXACT = new Set(
  [
    'garage sale',
    'yard sale',
    'moving sale',
    'estate sale',
    'tag sale',
    'rummage sale',
    'multi family sale',
    'multi-family sale',
    'community sale',
    'neighborhood sale',
    'sale',
    'moving',
    'estate',
  ].map((s) => s.toLowerCase())
)

export type DuplicateListingConfidence =
  | 'exact_duplicate'
  | 'probable_duplicate'
  | 'recurring_repost'
  | 'weak_match'
  | 'distinct_listing'

export type SoftDuplicateCandidateRow = {
  id: string
  date_start: string | null
  date_end: string | null
  title: string | null
  source_platform: string | null
  external_id: string | null
  lat: number | null
  lng: number | null
  image_source_url: string | null
  source_url?: string | null
  canonical_source_url?: string | null
  /** Phase 8 soft-dedupe safety (optional on fetch). */
  sale_instance_key?: string | null
  source_listing_id?: string | null
  source_location_hash?: string | null
  canonical_sale_instance_key?: string | null
  status?: string | null
  failure_reasons?: unknown
}

export type DuplicateScoringIncoming = {
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  normalizedTitle: string | null
  sourcePlatform: string | null
  externalId: string | null
  imageSourceUrl: string | null
  lat: number | null
  lng: number | null
}

export type SoftDuplicateScoreBreakdown = {
  baseAddressDateWindow: number
  titleOverlap: number
  externalIdMatch: number
  sourcePlatformMatch: number
  dateExactBonus: number
  dateAdjacentDayBonus: number
  imageUrlMatch: number
  geoProximityBonus: number
  materialTitleChangePenalty: number
  total: number
}

export type SoftDuplicateEvaluation = {
  winner: SoftDuplicateCandidateRow | null
  bestScore: number
  bestBreakdown: SoftDuplicateScoreBreakdown | null
  confidence: DuplicateListingConfidence
  suppress: boolean
  /** Lexicographic tie-breaker id used when multiple candidates share the best score. */
  tieBreakId: string | null
}

export function normalizeTitleForDedupe(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function isGenericSaleTitle(normalizedTitle: string): boolean {
  const t = normalizedTitle.trim()
  if (!t) return true
  if (GENERIC_TITLE_EXACT.has(t)) return true
  if (t.length <= 12 && /^[a-z\s-]+$/i.test(t) && !/\d/.test(t)) {
    const words = t.split(/\s+/).filter(Boolean)
    if (words.length <= 3 && words.every((w) => GENERIC_TITLE_EXACT.has(w) || w === 'family' || w === 'multi'))
      return true
  }
  return false
}

/** True when address normalization may collide across units / templates. */
export function addressSignalsWeakConfidence(normalizedAddress: string | null): boolean {
  if (!normalizedAddress?.trim()) return true
  const a = normalizedAddress.toLowerCase()
  if (a.length < 12) return true
  if (/\b(apt|apartment|unit|#|suite|ste)\b/i.test(a)) return true
  if (/\b(condo|condos|townhome|townhomes)\b/i.test(a)) return true
  return false
}

function parseUtcDayStart(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00.000Z`).getTime()
}

export function calendarDaysBetweenUtc(aIso: string, bIso: string): number {
  const a = parseUtcDayStart(aIso)
  const b = parseUtcDayStart(bIso)
  return Math.round(Math.abs(a - b) / 86_400_000)
}

function titleTokens(normalizedTitle: string): string[] {
  const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'from'])
  return normalizedTitle
    .split(/[^a-z0-9]+/i)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3 && !STOP.has(t))
    .sort((x, y) => x.localeCompare(y))
}

/** Deterministic Jaccard-like overlap on sorted token sets, scaled 0–100. */
export function titleOverlapPercent(aNorm: string, bNorm: string): number {
  const ta = titleTokens(aNorm)
  const tb = titleTokens(bNorm)
  if (ta.length === 0 && tb.length === 0) return 100
  if (ta.length === 0 || tb.length === 0) return 0
  let i = 0
  let j = 0
  let inter = 0
  while (i < ta.length && j < tb.length) {
    const c = ta[i]!.localeCompare(tb[j]!)
    if (c === 0) {
      inter += 1
      i += 1
      j += 1
    } else if (c < 0) i += 1
    else j += 1
  }
  const union = ta.length + tb.length - inter
  if (union <= 0) return 0
  return Math.round((100 * inter) / union)
}

function normalizeHttpsUrl(u: string | null | undefined): string | null {
  if (!u?.trim()) return null
  try {
    const url = new URL(u.trim())
    if (url.protocol !== 'https:') return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function scoreOneCandidate(
  incoming: DuplicateScoringIncoming,
  candidate: SoftDuplicateCandidateRow
): SoftDuplicateScoreBreakdown {
  const incTitle = normalizeTitleForDedupe(incoming.normalizedTitle)
  const candTitle = normalizeTitleForDedupe(candidate.title)
  const overlap = titleOverlapPercent(incTitle, candTitle)

  let baseAddressDateWindow = 0
  if (incoming.dateStart && candidate.date_start) {
    const days = calendarDaysBetweenUtc(incoming.dateStart, candidate.date_start)
    if (days <= SOFT_DATE_OVERLAP_CALENDAR_DAY_RADIUS) baseAddressDateWindow = 40
    else if (days <= SOFT_CANDIDATE_FETCH_DAY_RADIUS) baseAddressDateWindow = 25
  }

  let titleOverlapPts = 0
  if (overlap >= 60) titleOverlapPts = 35
  else if (overlap >= 40) titleOverlapPts = 28
  else if (overlap >= 25) titleOverlapPts = 18
  else if (overlap >= 12) titleOverlapPts = 8

  let externalIdMatch = 0
  const ie = incoming.externalId?.trim()
  const ce = candidate.external_id?.trim()
  if (ie && ce && ie === ce) externalIdMatch = 38

  let sourcePlatformMatch = 0
  const ip = incoming.sourcePlatform?.trim()
  const cp = candidate.source_platform?.trim()
  if (ip && cp && ip.toLowerCase() === cp.toLowerCase()) sourcePlatformMatch = 12

  let dateExactBonus = 0
  let dateAdjacentDayBonus = 0
  if (incoming.dateStart && candidate.date_start) {
    const d = calendarDaysBetweenUtc(incoming.dateStart, candidate.date_start)
    if (d === 0) dateExactBonus = 22
    else if (d === 1) dateAdjacentDayBonus = 10
  }

  let imageUrlMatch = 0
  const iu = normalizeHttpsUrl(incoming.imageSourceUrl)
  const cu = normalizeHttpsUrl(candidate.image_source_url)
  if (iu && cu && iu === cu) imageUrlMatch = 18

  let geoProximityBonus = 0
  if (
    incoming.lat != null &&
    incoming.lng != null &&
    candidate.lat != null &&
    candidate.lng != null &&
    Number.isFinite(incoming.lat) &&
    Number.isFinite(incoming.lng) &&
    Number.isFinite(candidate.lat) &&
    Number.isFinite(candidate.lng)
  ) {
    const m = haversineMeters(incoming.lat, incoming.lng, candidate.lat, candidate.lng)
    if (m <= DUPLICATE_GEO_MATCH_MAX_METERS) geoProximityBonus = 12
  }

  let materialTitleChangePenalty = 0
  if (incoming.dateStart && candidate.date_start && calendarDaysBetweenUtc(incoming.dateStart, candidate.date_start) === 0) {
    if (externalIdMatch === 0 && overlap < 15) materialTitleChangePenalty = 35
  }

  const total =
    baseAddressDateWindow +
    titleOverlapPts +
    externalIdMatch +
    sourcePlatformMatch +
    dateExactBonus +
    dateAdjacentDayBonus +
    imageUrlMatch +
    geoProximityBonus -
    materialTitleChangePenalty

  return {
    baseAddressDateWindow,
    titleOverlap: titleOverlapPts,
    externalIdMatch,
    sourcePlatformMatch,
    dateExactBonus,
    dateAdjacentDayBonus,
    imageUrlMatch,
    geoProximityBonus,
    materialTitleChangePenalty,
    total,
  }
}

function effectiveSuppressThreshold(incoming: DuplicateScoringIncoming): number {
  let t = SOFT_SUPPRESS_MIN_SCORE
  if (isGenericSaleTitle(normalizeTitleForDedupe(incoming.normalizedTitle))) {
    t = Math.max(t, SOFT_SUPPRESS_MIN_SCORE_GENERIC_TITLE)
  }
  if (addressSignalsWeakConfidence(incoming.normalizedAddress)) {
    t = Math.max(t, SOFT_SUPPRESS_MIN_SCORE_WEAK_ADDRESS)
  }
  return t
}

function classifyConfidence(
  incoming: DuplicateScoringIncoming,
  winner: SoftDuplicateCandidateRow,
  breakdown: SoftDuplicateScoreBreakdown
): DuplicateListingConfidence {
  const ie = incoming.externalId?.trim()
  const ce = winner.external_id?.trim()
  const sameExternal = Boolean(ie && ce && ie === ce)
  if (sameExternal) return 'recurring_repost'
  if (breakdown.dateAdjacentDayBonus > 0 && breakdown.titleOverlap >= 18) return 'recurring_repost'
  if (breakdown.titleOverlap >= 28 || breakdown.imageUrlMatch > 0) return 'probable_duplicate'
  return 'probable_duplicate'
}

/**
 * Deterministic: candidates must be pre-sorted by `id` ascending before calling.
 * Picks lexicographically smallest id among ties on `total` score.
 */
export function evaluateSoftDuplicateAgainstCandidates(
  incoming: DuplicateScoringIncoming,
  candidates: readonly SoftDuplicateCandidateRow[]
): SoftDuplicateEvaluation {
  if (!incoming.normalizedAddress?.trim() || !incoming.dateStart) {
    return {
      winner: null,
      bestScore: 0,
      bestBreakdown: null,
      confidence: 'distinct_listing',
      suppress: false,
      tieBreakId: null,
    }
  }

  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id))
  let best: { row: SoftDuplicateCandidateRow; breakdown: SoftDuplicateScoreBreakdown } | null = null

  for (const row of sorted) {
    if (!row.date_start) continue
    const days = calendarDaysBetweenUtc(incoming.dateStart, row.date_start)
    if (days > SOFT_CANDIDATE_FETCH_DAY_RADIUS) continue
    const breakdown = scoreOneCandidate(incoming, row)
    if (!best) {
      best = { row, breakdown }
      continue
    }
    if (breakdown.total > best.breakdown.total) best = { row, breakdown }
    else if (breakdown.total === best.breakdown.total && row.id.localeCompare(best.row.id) < 0) best = { row, breakdown }
  }

  if (!best) {
    return {
      winner: null,
      bestScore: 0,
      bestBreakdown: null,
      confidence: 'distinct_listing',
      suppress: false,
      tieBreakId: null,
    }
  }

  const threshold = effectiveSuppressThreshold(incoming)
  const suppress = best.breakdown.total >= threshold
  if (!suppress) {
    return {
      winner: best.row,
      bestScore: best.breakdown.total,
      bestBreakdown: best.breakdown,
      confidence: 'weak_match',
      suppress: false,
      tieBreakId: best.row.id,
    }
  }

  const confidence = classifyConfidence(incoming, best.row, best.breakdown)
  return {
    winner: best.row,
    bestScore: best.breakdown.total,
    bestBreakdown: best.breakdown,
    confidence,
    suppress: true,
    tieBreakId: best.row.id,
  }
}
