import { getNominatimEmail } from '@/lib/env'

export interface GeocodeAddressInput {
  address: string
  city: string
  state: string
}

export interface GeocodeAddressResult {
  lat: number
  lng: number
}

/**
 * Minimal provider wrapper for deferred ingestion geocoding.
 * This is intentionally isolated from ingestion parsing flow.
 */
export async function geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeAddressResult | null> {
  const address = input.address.trim()
  const city = input.city.trim()
  const state = input.state.trim()

  if (!address || !city || !state) {
    return null
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

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as Array<{ lat?: string; lon?: string }>
    const first = payload[0]
    if (!first?.lat || !first?.lon) {
      return null
    }

    const lat = Number.parseFloat(first.lat)
    const lng = Number.parseFloat(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null
    }

    return { lat, lng }
  } catch {
    return null
  }
}

