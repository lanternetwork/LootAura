import { z } from 'zod'

// Geocode response schema that handles both direct and wrapped formats
export const ZipGeocodeResponse = z.union([
  // Direct format: { lat, lng, city?, state? }
  z.object({
    lat: z.number(),
    lng: z.number(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    source: z.string().optional()
  }),
  // Wrapped format: { data: { lat, lng } }
  z.object({
    data: z.object({
      lat: z.number(),
      lng: z.number(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      source: z.string().optional()
    })
  })
])

export type ZipGeocodeResponseType = z.infer<typeof ZipGeocodeResponse>

// Normalizer that always returns { lat, lng } format
export function normalizeGeocode(json: any): { lat: number; lng: number; city?: string; state?: string; zip?: string; source?: string } {
  const parsed = ZipGeocodeResponse.safeParse(json)
  
  if (!parsed.success) {
    throw new Error(`Invalid geocode response: ${parsed.error.message}`)
  }
  
  const data = parsed.data
  
  // Handle wrapped format
  if ('data' in data) {
    return {
      lat: data.data.lat,
      lng: data.data.lng,
      city: data.data.city,
      state: data.data.state,
      zip: data.data.zip,
      source: data.data.source
    }
  }
  
  // Handle direct format
  return {
    lat: data.lat,
    lng: data.lng,
    city: data.city,
    state: data.state,
    zip: data.zip,
    source: data.source
  }
}
