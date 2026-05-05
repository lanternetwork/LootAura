import { getNominatimEmail } from '@/lib/env'
import { logger } from '@/lib/log'

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

/** Outcome of a single Nominatim lookup for ingestion geocoding. */
export interface GeocodeAddressOutcome {
  coords: GeocodeAddressResult | null
  /** True only when the provider responded with HTTP 429 (retriable). */
  hit429: boolean
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
    return { coords: null, hit429: false }
  }

  try {
    const email = getNominatimEmail()
    const query = `${address}, ${city}, ${state}`
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&email=${email}&limit=1`

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
      })
      await sleep(RATE_LIMIT_BACKOFF_MS)
      return { coords: null, hit429: true }
    }

    if (!response.ok) {
      logger.warn('Nominatim geocode request failed (non-OK response)', {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_fetch',
        status: response.status,
      })
      return { coords: null, hit429: false }
    }

    const payload = (await response.json()) as Array<{ lat?: string; lon?: string }>
    const first = payload[0]
    if (!first?.lat || !first?.lon) {
      return { coords: null, hit429: false }
    }

    const lat = Number.parseFloat(first.lat)
    const lng = Number.parseFloat(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { coords: null, hit429: false }
    }

    return { coords: { lat, lng }, hit429: false }
  } catch (error) {
    logger.error(
      'Nominatim geocode unexpected error',
      error instanceof Error ? error : new Error(String(error)),
      {
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_fetch',
      }
    )
    return { coords: null, hit429: false }
  }
}

