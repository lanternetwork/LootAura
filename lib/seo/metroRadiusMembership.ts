import { haversineMeters } from '@/lib/geo/distance'
import type { SeoMetroGeographyRow } from '@/lib/seo/metroGeographyTypes'

const METERS_PER_MILE = 1609.344

export function distanceToMetroCenterMiles(
  lat: number,
  lng: number,
  metro: Pick<SeoMetroGeographyRow, 'center_lat' | 'center_lng'>
): number {
  return haversineMeters(lat, lng, metro.center_lat, metro.center_lng) / METERS_PER_MILE
}

/** True when sale coordinates fall within metro.radius_miles of metro center. */
export function isWithinMetroRadius(
  lat: number,
  lng: number,
  metro: Pick<SeoMetroGeographyRow, 'center_lat' | 'center_lng' | 'radius_miles'>
): boolean {
  return distanceToMetroCenterMiles(lat, lng, metro) <= metro.radius_miles
}

/** All metros whose radius contains the sale (sorted by slug ascending). */
export function listMetroSlugsWithinRadius(
  lat: number,
  lng: number,
  metros: SeoMetroGeographyRow[]
): string[] {
  const slugs: string[] = []
  for (const metro of metros) {
    if (isWithinMetroRadius(lat, lng, metro)) {
      slugs.push(metro.slug)
    }
  }
  slugs.sort((a, b) => a.localeCompare(b))
  return slugs
}
