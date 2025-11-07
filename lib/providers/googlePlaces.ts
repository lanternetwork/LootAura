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

  const body: any = {
    input: input.trim(),
    languageCode: 'en',
    regionCode: 'US',
    locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 20000 } },
    sessionToken,
  }

  const resp = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      // Field mask for Places API (New): use suggestions.placePrediction.*
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat.mainText,suggestions.placePrediction.structuredFormat.secondaryText',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!resp.ok) {
    let msg = `Google autocomplete failed: ${resp.status}`
    try {
      const err = await resp.json()
      if (err?.error?.message) msg += ` - ${err.error.message}`
    } catch {}
    throw new Error(msg)
  }
  const data = await resp.json().catch(() => ({}))
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : []
  // Map Places (New) suggestions
  const mappedFromSuggestions: GooglePrediction[] = suggestions.map((s: any) => {
    const pp = s.placePrediction || s.place_prediction || s
    return {
      placeId: pp?.placeId || pp?.place_id || '',
      primaryText: pp?.structuredFormat?.mainText?.text || pp?.primaryText || pp?.description || '',
      secondaryText: pp?.structuredFormat?.secondaryText?.text || pp?.secondaryText || '',
    }
  }).filter((p: GooglePrediction) => !!p.placeId && !!p.primaryText)

  if (mappedFromSuggestions.length > 0) return mappedFromSuggestions

  // Fallback for any legacy/mock shapes
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
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en&sessionToken=${encodeURIComponent(sessionToken)}`

  const resp = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location',
    },
    signal,
  })
  if (!resp.ok) {
    console.error('[GOOGLE_PLACES] Place Details API error:', resp.status, resp.statusText)
    try {
      const errorData = await resp.json()
      console.error('[GOOGLE_PLACES] Error details:', errorData)
    } catch {}
    return null
  }
  const data = await resp.json().catch((error) => {
    console.error('[GOOGLE_PLACES] Error parsing Place Details response:', error)
    return null
  })
  if (!data) {
    console.warn('[GOOGLE_PLACES] Place Details response is null')
    return null
  }

  console.log('[GOOGLE_PLACES] Place Details raw response:', data)

  const formatted = data.formattedAddress || data.formatted_address
  const location = data.location || data.geometry?.location
  const comps = data.addressComponents || data.address_components || []

  console.log('[GOOGLE_PLACES] Extracted components:', { formatted, location, compsCount: comps.length })

  const byType = (type: string) => comps.find((c: any) => (c.types || c.types?.length ? c.types : c?.type)?.includes?.(type)) || comps.find((c: any) => c?.type === type)
  const getShort = (t: string) => byType(t)?.shortText || byType(t)?.short_name || ''
  const getLong = (t: string) => byType(t)?.longText || byType(t)?.long_name || ''

  const houseNumber = getLong('street_number') || getShort('street_number')
  const road = getLong('route') || getShort('route')
  const city = getLong('locality') || getLong('postal_town') || getLong('sublocality')
  const state = getShort('administrative_area_level_1') || getLong('administrative_area_level_1')
  const postcode = getLong('postal_code') || getShort('postal_code')
  const country = getLong('country') || getShort('country')

  console.log('[GOOGLE_PLACES] Extracted address components:', { houseNumber, road, city, state, postcode, country })

  if (!location?.latitude || !location?.longitude) {
    console.warn('[GOOGLE_PLACES] Missing location data')
    return null
  }
  
  // Don't filter by country - allow all countries for now
  // if (country?.toLowerCase() !== 'united states') {
  //   console.warn('[GOOGLE_PLACES] Not US address:', country)
  //   return null
  // }

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


