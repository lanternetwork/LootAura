import { getNominatimEmail } from '@/lib/env'
import { logger } from '@/lib/log'
import { createHash } from 'node:crypto'
import { normalizeIngestionCity, normalizeIngestionState } from '@/lib/ingestion/normalizeIngestionLocation'

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
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
export async function geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeAddressOutcome> {
  const address = input.address.trim()
  const city = input.city.trim()
  const state = input.state.trim()

  if (!address || !city || !state) {
    return {
      coords: null,
      hit429: false,
      noCoordsReason: 'empty_input',
      providerClassification: 'empty_results',
    }
  }

  try {
    const email = getNominatimEmail()
    const postalCodeMatch = address.match(/\b\d{5}(?:-\d{4})?\b/)
    const postalCode = postalCodeMatch?.[0] ?? null
    const query = buildResidentialQuery(address, city, state, postalCode)
    const queryFingerprint = createHash('sha256').update(query.toLowerCase()).digest('hex').slice(0, 16)
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
        queryFingerprint,
      })
      await sleep(RATE_LIMIT_BACKOFF_MS)
      return {
        coords: null,
        hit429: true,
        noCoordsReason: 'rate_limited',
        queryFingerprint,
        providerClassification: 'rate_limited',
      }
    }

    if (!response.ok) {
      logger.warn('Nominatim geocode request failed (non-OK response)', {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_fetch',
        status: response.status,
        queryFingerprint,
      })
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'http_not_ok',
        httpStatus: response.status,
        queryFingerprint,
        providerClassification: 'http_not_ok',
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
        return {
          coords: null,
          hit429: true,
          noCoordsReason: 'rate_limited_soft',
          queryFingerprint,
          providerClassification: 'rate_limited_soft',
        }
      }
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'empty_results',
        queryFingerprint,
        providerClassification: 'empty_results',
      }
    }

    const lat = Number.parseFloat(first.lat)
    const lng = Number.parseFloat(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'invalid_coordinates',
        queryFingerprint,
        providerClassification: 'invalid_coordinates',
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
    const cityMismatch =
      Boolean(providerCity) &&
      normalizeIngestionCity(providerCity) !== normalizeIngestionCity(city)
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
    if (lowImportance || broadMatch || cityMismatch || stateMismatch) {
      logger.warn('Nominatim returned low-confidence geocode candidate', {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_classify',
        queryFingerprint,
        lowConfidenceReasons,
      })
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'low_confidence',
        queryFingerprint,
        providerClassification: 'low_confidence',
        lowConfidenceReasons,
      }
    }

    return { coords: { lat, lng }, hit429: false, queryFingerprint, providerClassification: 'ok' }
  } catch (error) {
    logger.error(
      'Nominatim geocode unexpected error',
      error instanceof Error ? error : new Error(String(error)),
      {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_fetch',
      }
    )
    return {
      coords: null,
      hit429: false,
      noCoordsReason: 'fetch_exception',
      providerClassification: 'fetch_exception',
    }
  }
}

