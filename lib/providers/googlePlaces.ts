import { AddressSuggestion } from '@/lib/geocode'

export type GooglePrediction = {
  placeId: string
  primaryText: string
  secondaryText?: string
}

function getApiKey(): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY
  if (!key) throw new Error('NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is not set')
  return key
}

export async function googleAutocomplete(
  input: string,
  lat: number,
  lng: number,
  sessionToken: string,
  signal?: AbortSignal
): Promise<GooglePrediction[]> {
  if (!input || input.trim().length < 2) return []
  const key = getApiKey()

  const body = {
    input: input.trim(),
    languageCode: 'en',
    regionCode: 'US',
    includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'plus_code'],
    locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } },
    sessionToken,
  }

  const resp = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!resp.ok) {
    throw new Error(`Google autocomplete failed: ${resp.status}`)
  }
  const data = await resp.json().catch(() => ({}))
  const predictions = Array.isArray(data.predictions) ? data.predictions : []

  return predictions.map((p: any) => ({
    placeId: p.placeId || p.place_id || '',
    primaryText: p.structuredFormat?.mainText?.text || p.primary_text || p.description || '',
    secondaryText: p.structuredFormat?.secondaryText?.text || p.secondary_text || '',
  })).filter((p: GooglePrediction) => !!p.placeId && !!p.primaryText)
}

export async function googlePlaceDetails(
  placeId: string,
  sessionToken: string,
  signal?: AbortSignal
): Promise<AddressSuggestion | null> {
  if (!placeId) return null
  const key = getApiKey()
  const fields = 'id,formattedAddress,addressComponents,location'
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en&sessionToken=${encodeURIComponent(sessionToken)}&fields=${fields}`

  const resp = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': key,
    },
    signal,
  })
  if (!resp.ok) return null
  const data = await resp.json().catch(() => null)
  if (!data) return null

  const formatted = data.formattedAddress || data.formatted_address
  const location = data.location || data.geometry?.location
  const comps = data.addressComponents || data.address_components || []

  const byType = (type: string) => comps.find((c: any) => (c.types || c.types?.length ? c.types : c?.type)?.includes?.(type)) || comps.find((c: any) => c?.type === type)
  const getShort = (t: string) => byType(t)?.shortText || byType(t)?.short_name || ''
  const getLong = (t: string) => byType(t)?.longText || byType(t)?.long_name || ''

  const houseNumber = getLong('street_number') || getShort('street_number')
  const road = getLong('route') || getShort('route')
  const city = getLong('locality') || getLong('postal_town') || getLong('sublocality')
  const state = getShort('administrative_area_level_1') || getLong('administrative_area_level_1')
  const postcode = getLong('postal_code') || getShort('postal_code')
  const country = getLong('country') || getShort('country')

  if (!location?.latitude || !location?.longitude || country?.toLowerCase() !== 'united states') {
    return null
  }

  const suggestion: AddressSuggestion = {
    id: `google:${data.id || placeId}`,
    label: formatted || `${houseNumber ? houseNumber + ' ' : ''}${road || ''}${city ? `, ${city}` : ''}${state ? `, ${state}` : ''}${postcode ? ` ${postcode}` : ''}`,
    lat: Number(location.latitude),
    lng: Number(location.longitude),
    address: {
      houseNumber: houseNumber || undefined,
      road: road || undefined,
      city: city || undefined,
      state: state || undefined,
      postcode: postcode || undefined,
      country: country || undefined,
    },
  }
  return suggestion
}


