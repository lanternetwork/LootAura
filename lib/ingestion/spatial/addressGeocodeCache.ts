import type { CoordinatePrecision, GeocodeMethod } from '@/lib/geocode/geocodePrecisionPolicy'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { buildNormalizedAddressKey } from '@/lib/ingestion/spatial/normalizedAddressKey'
import { logger } from '@/lib/log'

export type AddressGeocodeCacheEntry = {
  lat: number
  lng: number
  coordinate_precision: CoordinatePrecision
  geocode_method: GeocodeMethod
}

export type AddressGeocodeCacheLookupInput = {
  addressRaw?: string | null
  normalizedAddress?: string | null
  city: string
  state: string
}

export function addressKeyForLookup(input: AddressGeocodeCacheLookupInput): string | null {
  return buildNormalizedAddressKey(input)
}

export async function lookupAddressGeocodeCache(
  input: AddressGeocodeCacheLookupInput
): Promise<(AddressGeocodeCacheEntry & { normalizedAddressKey: string }) | null> {
  const key = addressKeyForLookup(input)
  if (!key) return null

  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'address_geocode_cache')
    .select('normalized_address_key, lat, lng, coordinate_precision, geocode_method, hit_count')
    .eq('normalized_address_key', key)
    .maybeSingle()

  if (error) {
    logger.warn('address_geocode_cache lookup failed', {
      component: 'ingestion/spatial/addressGeocodeCache',
      operation: 'lookup',
      errorCode: error.code ?? 'unknown',
    })
    return null
  }
  if (!data) return null

  const lat = Number(data.lat)
  const lng = Number(data.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  await fromBase(admin, 'address_geocode_cache')
    .update({
      hit_count: (typeof data.hit_count === 'number' ? data.hit_count : 0) + 1,
      last_hit_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('normalized_address_key', key)
    .then(() => undefined)
    .catch(() => undefined)

  return {
    normalizedAddressKey: key,
    lat,
    lng,
    coordinate_precision: String(data.coordinate_precision) as CoordinatePrecision,
    geocode_method: String(data.geocode_method) as GeocodeMethod,
  }
}

export async function upsertAddressGeocodeCache(input: {
  addressRaw?: string | null
  normalizedAddress?: string | null
  city: string
  state: string
  lat: number
  lng: number
  coordinate_precision: CoordinatePrecision
  geocode_method: GeocodeMethod
}): Promise<void> {
  const key = buildNormalizedAddressKey(input)
  if (!key) return

  const admin = getAdminDb()
  const now = new Date().toISOString()
  const { error } = await fromBase(admin, 'address_geocode_cache').upsert(
    {
      normalized_address_key: key,
      lat: input.lat,
      lng: input.lng,
      coordinate_precision: input.coordinate_precision,
      geocode_method: input.geocode_method,
      updated_at: now,
    },
    { onConflict: 'normalized_address_key' }
  )

  if (error) {
    logger.warn('address_geocode_cache upsert failed', {
      component: 'ingestion/spatial/addressGeocodeCache',
      operation: 'upsert',
      errorCode: error.code ?? 'unknown',
    })
  }
}
