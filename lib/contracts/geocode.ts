import { z } from 'zod'

// Bbox schema for [minLng, minLat, maxLng, maxLat]
const BboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

// Geocode response schema that handles both direct and wrapped formats
export const ZipGeocodeResponse = z.union([
  // Direct format: { lat, lng, city?, state?, bbox? }
  z.object({
    lat: z.number(),
    lng: z.number(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    source: z.string().optional(),
    bbox: BboxSchema.optional()
  }),
  // Wrapped format: { result: { latitude, longitude, city, state, bbox? } }
  z.object({
    result: z.object({
      latitude: z.number(),
      longitude: z.number(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      source: z.string().optional(),
      bbox: BboxSchema.optional()
    })
  })
])

export type ZipGeocodeResponseType = z.infer<typeof ZipGeocodeResponse>

// Normalized ZIP geocode result
export type ZipGeo = {
  lat: number
  lng: number
  city: string
  state: string
  bbox?: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
}

// Normalizer that always returns ZipGeo format
export function normalizeGeocode(json: any): ZipGeo {
  const parsed = ZipGeocodeResponse.safeParse(json)
  
  if (!parsed.success) {
    throw new Error(`Invalid geocode response: ${parsed.error.message}`)
  }
  
  const data = parsed.data
  
  // Handle wrapped format
  if ('result' in data) {
    return {
      lat: data.result.latitude,
      lng: data.result.longitude,
      city: data.result.city || '',
      state: data.result.state || '',
      bbox: data.result.bbox
    }
  }
  
  // Handle direct format
  return {
    lat: data.lat,
    lng: data.lng,
    city: data.city || '',
    state: data.state || '',
    bbox: data.bbox
  }
}
