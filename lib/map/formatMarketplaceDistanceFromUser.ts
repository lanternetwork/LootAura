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
