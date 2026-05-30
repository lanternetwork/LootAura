import { haversineMeters } from '@/lib/geo/distance'
import { metersToMiles } from '@/lib/utils/distance'
import { isValidUserMapCoordinate } from '@/lib/map/isValidUserMapCoordinate'

export type UserMapCoordinates = { lat: number; lng: number }

/** Format user→sale distance for marketplace cards and callouts. */
export function formatMarketplaceDistanceFromUserMeters(meters: number): string {
  const miles = metersToMiles(meters)

  if (miles < 0.1) {
    return 'Nearby'
  }

  if (miles >= 100) {
    return `${Math.round(miles)} mi away`
  }

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

  const saleLat = sale.lat
  const saleLng = sale.lng
  if (!isValidUserMapCoordinate(saleLat, saleLng)) {
    return null
  }

  const meters = haversineMeters(userLocation.lat, userLocation.lng, saleLat, saleLng)
  return formatMarketplaceDistanceFromUserMeters(meters)
}
