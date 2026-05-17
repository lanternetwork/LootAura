import { getNominatimEmail } from '@/lib/env'
import { logger } from '@/lib/log'
import { createHash } from 'node:crypto'
import {
  minimalNormalizeLocalityForPrimaryGeocode,
  normalizeIngestionCity,
  normalizeIngestionState,
  normalizeLocalityForGeocodeQuery,
} from '@/lib/ingestion/normalizeIngestionLocation'
import {
  confidenceForPrecision,
  methodForPrecision,
  type CoordinatePrecision,
  type GeocodeConfidence,
  type GeocodeMethod,
} from '@/lib/geocode/geocodePrecisionPolicy'
import { inferCoordinatePrecision } from '@/lib/geocode/inferCoordinatePrecision'

const RATE_LIMIT_BACKOFF_MS = 250

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export interface GeocodeAddressInput {
  address: string
  city: string
  state: string
}

/** `fallback_arbitrated` expands hyphenated localities for Nominatim; `primary` keeps visible tokens. */
export type GeocodeMode = 'primary' | 'fallback_arbitrated'

export interface GeocodeAddressOptions {
  mode?: GeocodeMode
  /** When `allow_broad_locality`, city-only queries and broad Nominatim matches may return coords tagged locality. */
  classificationMode?: 'strict' | 'allow_broad_locality'
}

export type GeocodeQueryStrategy = 'minimal_locality' | 'normalize_locality'

export interface GeocodeAttemptLog {
  mode: GeocodeMode
  queryStrategy: GeocodeQueryStrategy
  queryString: string
  queryFingerprint?: string
}

export interface GeocodeAddressResult {
  lat: number
  lng: number
}

/** Why Nominatim returned no coordinates (PII-free; for worker diagnostics). */
export type GeocodeNoCoordsReason =
  | 'empty_input'
  | 'rate_limited'
  | 'rate_limited_soft'
  | 'http_not_ok'
  | 'empty_results'
  | 'low_confidence'
  | 'invalid_coordinates'
  | 'fetch_exception'

/** Outcome of a single Nominatim lookup for ingestion geocoding. */
export interface GeocodeAddressOutcome {
  coords: GeocodeAddressResult | null
  /** True only when the provider responded with HTTP 429 (retriable). */
  hit429: boolean
  /** Set when `coords` is null; classifies the silent no-result path. */
  noCoordsReason?: GeocodeNoCoordsReason
  /** HTTP status when `noCoordsReason` is `http_not_ok`. */
  httpStatus?: number
  /** Stable PII-safe fingerprint for query replay diagnostics. */
  queryFingerprint?: string
  /** Provider-side classification for observability and retries. */
  providerClassification?:
    | 'ok'
    | 'rate_limited'
    | 'rate_limited_soft'
    | 'http_not_ok'
    | 'empty_results'
    | 'low_confidence'
    | 'invalid_coordinates'
    | 'fetch_exception'
  /** Optional low-confidence reason flags for operator diagnostics. */
  lowConfidenceReasons?: Array<'low_importance' | 'broad_match' | 'city_mismatch' | 'state_mismatch'>
  /** Ingestion row city (trimmed); persisted on failed attempts only (ops). */
  geocodeCityRaw?: string
  /** City token after `normalizeLocalityForGeocodeQuery`; persisted on failed attempts only. */
  geocodeCityNormalized?: string
  /** Single-attempt diagnostics (DB persists fingerprint + length only; no raw query text). */
  attemptLog?: GeocodeAttemptLog
  coordinatePrecision?: CoordinatePrecision
  geocodeConfidence?: GeocodeConfidence
  geocodeMethod?: GeocodeMethod
  broadMatch?: boolean
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function usZipBase(zip: string): string {
  return zip.replace(/-\d{4}$/u, '')
}

/** Leading house-number style token: first 5 digits at start of a comma segment (not substring). */
function leadingFiveDigitHouseNumber(segment: string): string | null {
  const s = normalizeWhitespace(segment)
  const m = s.match(/^(\d{5})(?:-\d{4})?\b/u)
  return m?.[1] ?? null
}

/**
 * US ZIP/ZIP+4 for Nominatim `q=` assembly. Only values from a trusted
 * locality/state/postal tail are returned — never the first 5-digit match in the
 * full string (avoids house numbers like 11020 being used as postal codes).
 *
 * Applied in order:
 * 1. Last comma segment is ZIP/ZIP+4 only and the previous segment normalizes to
 *    the expected state (e.g. …, IL, 60614).
 * 2. Last comma segment is "{State} {ZIP}" where the state normalizes to the
 *    expected state (e.g. …, IL 60614, …, Illinois 60614).
 * 3. Last comma segment is ZIP/ZIP+4 only and the previous segment is not that
 *    state — e.g. street/sub-address chunks then a lone postal segment when city
 *    and state are supplied separately (…, 95628).
 * 4. Full address ends with `\\b{STATE}\\s+{ZIP}$` for the expected 2-letter
 *    state code (e.g. … Denver CO 80211) when the postal code is not isolated by
 *    commas.
 *
 * Rejection: if the candidate’s 5-digit base equals the leading house-number
 * token at the start of the first comma segment, returns null (stops duplicate /
 * malformed trailing numerics mirroring the street number).
 */
export function extractUsPostalCodeForGeocodeQuery(address: string, expectedState: string): string | null {
  const trimmed = normalizeWhitespace(address)
  if (!trimmed || !normalizeWhitespace(expectedState)) return null

  const expectedNorm = normalizeIngestionState(expectedState)
  if (!expectedNorm) return null

  const parts = trimmed.split(',').map((p) => normalizeWhitespace(p)).filter(Boolean)

  let candidate: string | null = null

  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    const prev = parts[parts.length - 2]
    const zipOnly = last.match(/^(\d{5}(?:-\d{4})?)$/u)

    if (zipOnly && normalizeIngestionState(prev) === expectedNorm) {
      candidate = last
    } else {
      const stateZip = last.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/u)
      if (stateZip) {
        const maybeState = normalizeWhitespace(stateZip[1])
        if (normalizeIngestionState(maybeState) === expectedNorm) {
          candidate = stateZip[2]
        }
      }
    }

    if (!candidate && zipOnly && normalizeIngestionState(prev) !== expectedNorm) {
      candidate = last
    }
  }

  if (!candidate) {
    const m = trimmed.match(new RegExp(`\\b${escapeRegExp(expectedNorm)}\\s+(\\d{5}(?:-\\d{4})?)\\s*$`, 'iu'))
    if (m) candidate = m[1]
  }

  if (!candidate) return null

  const firstSeg = parts[0] ?? trimmed
  const house = leadingFiveDigitHouseNumber(firstSeg)
  if (house && usZipBase(candidate) === house) {
    return null
  }

  return candidate
}

function isCityToken(token: string, city: string): boolean {
  return normalizeIngestionCity(token) === normalizeIngestionCity(city)
}

function isStateOrStateZipToken(token: string, state: string): boolean {
  const trimmed = normalizeWhitespace(token)
  const withoutZip = trimmed.replace(/\s+\d{5}(?:-\d{4})?$/u, '').trim()
  if (!withoutZip) return false
  return normalizeIngestionState(withoutZip) === normalizeIngestionState(state)
}

function stripTrailingPostalCode(value: string, postalCode: string | null): string {
  if (!postalCode) return value
  const pattern = new RegExp(`(?:,?\\s+)${escapeRegExp(postalCode)}$`, 'iu')
  return value.replace(pattern, '').trim()
}

function stripTrailingCityStateContext(value: string, city: string, state: string, postalCode: string | null): string {
  const normalizedState = normalizeIngestionState(state) || state.trim()
  if (!city.trim() || !normalizedState) {
    return stripTrailingPostalCode(value, postalCode)
  }
  const cityEsc = escapeRegExp(normalizeWhitespace(city))
  const stateEsc = escapeRegExp(normalizedState)
  const zipSegment = postalCode ? `(?:,?\\s+${escapeRegExp(postalCode)})?` : ''
  const trailingPattern = new RegExp(`(?:,?\\s+)${cityEsc}(?:,?\\s+)${stateEsc}${zipSegment}$`, 'iu')
  const stripped = value.replace(trailingPattern, '').trim()
  return stripTrailingPostalCode(stripped, postalCode)
}

function buildResidentialQuery(address: string, city: string, state: string, postalCode: string | null): string {
  // Keep sub-address segments (e.g. apt/suite) while removing obvious duplicate locality suffixes.
  const tokens = address
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)
  const postalRe = postalCode ? new RegExp(`^${escapeRegExp(postalCode)}$`, 'iu') : null
  const meaningfulTokens = tokens.filter((token) => {
    if (postalRe?.test(token)) return false
    if (/^usa$/iu.test(token) || /^united states(?: of america)?$/iu.test(token)) return false
    if (isCityToken(token, city)) return false
    if (isStateOrStateZipToken(token, state)) return false
    return true
  })
  const streetBase = meaningfulTokens.length > 0 ? meaningfulTokens.join(', ') : normalizeWhitespace(address)
  const street = stripTrailingCityStateContext(streetBase, city, state, postalCode)
  const queryParts = [street, city, state, postalCode, 'USA'].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  )
  return queryParts.join(', ')
}

/**
 * Minimal provider wrapper for deferred ingestion geocoding.
 * This is intentionally isolated from ingestion parsing flow.
 */
export async function geocodeAddress(
  input: GeocodeAddressInput,
  options?: GeocodeAddressOptions
): Promise<GeocodeAddressOutcome> {
  const address = input.address.trim()
  const cityRaw = input.city.trim()
  const state = input.state.trim()
  const mode: GeocodeMode = options?.mode ?? 'fallback_arbitrated'
  const classificationMode = options?.classificationMode ?? 'strict'
  const localityOnly = classificationMode === 'allow_broad_locality' && address.length === 0
  const queryStrategy: GeocodeQueryStrategy = mode === 'primary' ? 'minimal_locality' : 'normalize_locality'

  if ((!address && !localityOnly) || !cityRaw || !state) {
    logger.info('Nominatim geocode skipped (empty locality inputs)', {
      component: 'geocode/geocodeAddress',
      operation: 'nominatim_query',
      geocode_city_raw: cityRaw || undefined,
      geocode_city_normalized: undefined,
      queryFingerprint: undefined,
      geocodeMode: mode,
      queryStrategy,
      providerClassification: 'empty_results' as const,
    })
    return {
      coords: null,
      hit429: false,
      noCoordsReason: 'empty_input',
      providerClassification: 'empty_results',
      geocodeCityRaw: cityRaw || undefined,
      geocodeCityNormalized: undefined,
      attemptLog: {
        mode,
        queryStrategy,
        queryString: '',
      },
    }
  }

  const cityNormalized =
    mode === 'primary'
      ? minimalNormalizeLocalityForPrimaryGeocode(cityRaw)
      : (normalizeLocalityForGeocodeQuery(cityRaw) ?? cityRaw)

  try {
    const email = getNominatimEmail()
    const postalCode = localityOnly ? null : extractUsPostalCodeForGeocodeQuery(address, state)
    const query = localityOnly
      ? [cityNormalized, state, 'USA'].filter(Boolean).join(', ')
      : buildResidentialQuery(address, cityNormalized, state, postalCode)
    const queryFingerprint = createHash('sha256').update(query.toLowerCase()).digest('hex').slice(0, 16)
    const attemptLog: GeocodeAttemptLog = {
      mode,
      queryStrategy,
      queryString: query,
      queryFingerprint,
    }
    logger.info('Nominatim geocode query prepared', {
      component: 'geocode/geocodeAddress',
      operation: 'nominatim_query',
      geocode_city_raw: cityRaw,
      geocode_city_normalized: cityNormalized,
      queryFingerprint,
      geocodeMode: mode,
      queryStrategy,
      queryCharLength: query.length,
    })
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      query
    )}&email=${email}&limit=3&addressdetails=1&countrycodes=us`

    const response = await fetch(url, {
      headers: {
        'User-Agent': `LootAura/1.0 (contact: ${email})`,
      },
    })

    if (response.status === 429) {
      logger.warn('Nominatim rate limited (HTTP 429); treating as retriable geocode failure', {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_fetch',
        status: 429,
        geocode_city_raw: cityRaw,
        geocode_city_normalized: cityNormalized,
        queryFingerprint,
        providerClassification: 'rate_limited' as const,
      })
      await sleep(RATE_LIMIT_BACKOFF_MS)
      return {
        coords: null,
        hit429: true,
        noCoordsReason: 'rate_limited',
        queryFingerprint,
        providerClassification: 'rate_limited',
        geocodeCityRaw: cityRaw,
        geocodeCityNormalized: cityNormalized,
        attemptLog,
      }
    }

    if (!response.ok) {
      logger.warn('Nominatim geocode request failed (non-OK response)', {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_fetch',
        status: response.status,
        geocode_city_raw: cityRaw,
        geocode_city_normalized: cityNormalized,
        queryFingerprint,
        providerClassification: 'http_not_ok' as const,
      })
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'http_not_ok',
        httpStatus: response.status,
        queryFingerprint,
        providerClassification: 'http_not_ok',
        geocodeCityRaw: cityRaw,
        geocodeCityNormalized: cityNormalized,
        attemptLog,
      }
    }

    const payload = (await response.json()) as Array<{
      lat?: string
      lon?: string
      importance?: number | string
      addresstype?: string
      class?: string
      type?: string
      address?: { city?: string; town?: string; village?: string; hamlet?: string; state?: string }
    }>
    const first = payload[0]
    if (!first?.lat || !first?.lon) {
      const remainingRaw = response.headers?.get?.('x-ratelimit-remaining') ?? null
      const retryAfterRaw = response.headers?.get?.('retry-after') ?? null
      const isSoftRateLimit =
        (remainingRaw != null && remainingRaw.trim() === '0') ||
        (retryAfterRaw != null && retryAfterRaw.trim().length > 0)
      if (isSoftRateLimit) {
        logger.info('Nominatim geocode outcome', {
          component: 'geocode/geocodeAddress',
          operation: 'nominatim_complete',
          geocode_city_raw: cityRaw,
          geocode_city_normalized: cityNormalized,
          queryFingerprint,
          providerClassification: 'rate_limited_soft' as const,
        })
        return {
          coords: null,
          hit429: true,
          noCoordsReason: 'rate_limited_soft',
          queryFingerprint,
          providerClassification: 'rate_limited_soft',
          geocodeCityRaw: cityRaw,
          geocodeCityNormalized: cityNormalized,
          attemptLog,
        }
      }
      logger.info('Nominatim geocode outcome', {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_complete',
        geocode_city_raw: cityRaw,
        geocode_city_normalized: cityNormalized,
        queryFingerprint,
        providerClassification: 'empty_results' as const,
      })
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'empty_results',
        queryFingerprint,
        providerClassification: 'empty_results',
        geocodeCityRaw: cityRaw,
        geocodeCityNormalized: cityNormalized,
        attemptLog,
      }
    }

    const lat = Number.parseFloat(first.lat)
    const lng = Number.parseFloat(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      logger.info('Nominatim geocode outcome', {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_complete',
        geocode_city_raw: cityRaw,
        geocode_city_normalized: cityNormalized,
        queryFingerprint,
        providerClassification: 'invalid_coordinates' as const,
      })
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'invalid_coordinates',
        queryFingerprint,
        providerClassification: 'invalid_coordinates',
        geocodeCityRaw: cityRaw,
        geocodeCityNormalized: cityNormalized,
        attemptLog,
      }
    }

    const importance =
      typeof first.importance === 'number'
        ? first.importance
        : typeof first.importance === 'string'
          ? Number.parseFloat(first.importance)
          : Number.NaN
    const addresstype = (first.addresstype || '').toLowerCase()
    const classification = (first.class || '').toLowerCase()
    const type = (first.type || '').toLowerCase()
    const providerCity = first.address?.city || first.address?.town || first.address?.village || first.address?.hamlet || ''
    const providerState = first.address?.state || ''
    const cityCanonical = normalizeIngestionCity(cityNormalized) ?? cityNormalized
    const cityMismatch =
      Boolean(providerCity) &&
      normalizeIngestionCity(providerCity) !== cityCanonical
    const stateMismatch =
      Boolean(providerState) &&
      normalizeIngestionState(providerState) !== normalizeIngestionState(state)
    const broadTypes = new Set([
      'country',
      'state',
      'county',
      'city',
      'postcode',
      'suburb',
      'neighbourhood',
      'municipality',
    ])
    const lowImportance = Number.isFinite(importance) && importance < 0.2
    const broadMatch = broadTypes.has(addresstype) || broadTypes.has(type) || classification === 'boundary'
    const lowConfidenceReasons: Array<'low_importance' | 'broad_match' | 'city_mismatch' | 'state_mismatch'> = []
    if (lowImportance) lowConfidenceReasons.push('low_importance')
    if (broadMatch) lowConfidenceReasons.push('broad_match')
    if (cityMismatch) lowConfidenceReasons.push('city_mismatch')
    if (stateMismatch) lowConfidenceReasons.push('state_mismatch')
    if (broadMatch || cityMismatch || stateMismatch) {
      if (classificationMode === 'allow_broad_locality' && broadMatch && !stateMismatch) {
        const precision = inferCoordinatePrecision({
          addressLine: address,
          classificationMode,
          broadMatch: true,
        })
        const method = methodForPrecision(precision, mode === 'fallback_arbitrated')
        return {
          coords: { lat, lng },
          hit429: false,
          queryFingerprint,
          providerClassification: 'ok',
          lowConfidenceReasons,
          geocodeCityRaw: cityRaw,
          geocodeCityNormalized: cityNormalized,
          attemptLog,
          coordinatePrecision: precision,
          geocodeConfidence: confidenceForPrecision(precision),
          geocodeMethod: method,
          broadMatch: true,
        }
      }
      logger.warn('Nominatim returned low-confidence geocode candidate', {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_classify',
        geocode_city_raw: cityRaw,
        geocode_city_normalized: cityNormalized,
        queryFingerprint,
        providerClassification: 'low_confidence' as const,
        lowConfidenceReasons,
      })
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'low_confidence',
        queryFingerprint,
        providerClassification: 'low_confidence',
        lowConfidenceReasons,
        geocodeCityRaw: cityRaw,
        geocodeCityNormalized: cityNormalized,
        attemptLog,
        broadMatch,
      }
    }

    const precision = inferCoordinatePrecision({
      addressLine: address,
      classificationMode,
      broadMatch: false,
    })
    const method = methodForPrecision(precision, mode === 'fallback_arbitrated')
    logger.info('Nominatim geocode succeeded', {
      component: 'geocode/geocodeAddress',
      operation: 'nominatim_complete',
      geocode_city_raw: cityRaw,
      geocode_city_normalized: cityNormalized,
      queryFingerprint,
      providerClassification: 'ok' as const,
      coordinatePrecision: precision,
      geocodeMethod: method,
      ...(lowImportance ? { low_importance_observed: true as const } : {}),
    })
    return {
      coords: { lat, lng },
      hit429: false,
      queryFingerprint,
      providerClassification: 'ok',
      geocodeCityRaw: cityRaw,
      geocodeCityNormalized: cityNormalized,
      attemptLog,
      coordinatePrecision: precision,
      geocodeConfidence: confidenceForPrecision(precision),
      geocodeMethod: method,
      broadMatch: false,
    }
  } catch (error) {
    logger.error(
      'Nominatim geocode unexpected error',
      error instanceof Error ? error : new Error(String(error)),
      {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_fetch',
        geocode_city_raw: cityRaw,
        geocode_city_normalized: cityNormalized,
        providerClassification: 'fetch_exception' as const,
      }
    )
    return {
      coords: null,
      hit429: false,
      noCoordsReason: 'fetch_exception',
      providerClassification: 'fetch_exception',
      geocodeCityRaw: cityRaw,
      geocodeCityNormalized: cityNormalized,
      attemptLog: {
        mode,
        queryStrategy,
        queryString: '',
      },
    }
  }
}

