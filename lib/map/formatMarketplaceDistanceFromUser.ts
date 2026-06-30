import { haversineMeters } from '@/lib/geo/distance'
import { metersToMiles } from '@/lib/utils/distance'
import { isValidUserMapCoordinate } from '@/lib/map/isValidUserMapCoordinate'

export type UserMapCoordinates = { lat: number; lng: number }

const METERS_PER_MILE = 1609.344
const NEARBY_MAX_METERS = 0.1 * METERS_PER_MILE
const LONG_DISTANCE_MIN_METERS = 100 * METERS_PER_MILE

/** Format user→sale distance for marketplace cards and callouts. */
export function formatMarketplaceDistanceFromUserMeters(meters: number): string {
  if (meters < NEARBY_MAX_METERS) {
    return 'Nearby'
  }

  if (meters >= LONG_DISTANCE_MIN_METERS) {
    return `${Math.round(metersToMiles(meters))} mi away`
  }

  const miles = metersToMiles(meters)
  const rounded = Math.round(miles * 10) / 10
  return `${rounded.toFixed(1)} mi away`
}

export type MarketplaceViewport = {
  center: { lat: number; lng: number }
  zoom?: number
} | null | undefined

/**
 * Marketplace list/card distance label aligned with GET /api/sales ranking.
 * Uses sale.distance_m (from viewport/bbox center) when present; otherwise
 * haversine from viewport center.
 *
 * @see docs/developer/marketplace-distance-semantics.md
 */
export function getMarketplaceDistanceLabel(
  sale: { lat?: number | null; lng?: number | null; distance_m?: number | null },
  viewport?: MarketplaceViewport
): string | null {
  if (
    typeof sale.distance_m === 'number' &&
    !Number.isNaN(sale.distance_m) &&
    sale.distance_m >= 0
  ) {
    return formatMarketplaceDistanceFromUserMeters(sale.distance_m)
  }

  const center = viewport?.center
  if (!center || !isValidUserMapCoordinate(center.lat, center.lng)) {
    return null
  }

  if (!isValidUserMapCoordinate(sale.lat, sale.lng)) {
    return null
  }

  const meters = haversineMeters(
    center.lat,
    center.lng,
    sale.lat as number,
    sale.lng as number
  )
  return formatMarketplaceDistanceFromUserMeters(meters)
}

/** Returns a distance label when both user and sale coordinates are valid; otherwise null. */
export function getMarketplaceDistanceFromUserLabel(
  userLocation: UserMapCoordinates | null | undefined,
  sale: { lat?: number | null; lng?: number | null }
): string | null {
  if (!userLocation || !isValidUserMapCoordinate(userLocation.lat, userLocation.lng)) {
    return null
  }

  if (!isValidUserMapCoordinate(sale.lat, sale.lng)) {
    return null
  }

  const meters = haversineMeters(
    userLocation.lat,
    userLocation.lng,
    sale.lat as number,
    sale.lng as number
  )
  return formatMarketplaceDistanceFromUserMeters(meters)
}
