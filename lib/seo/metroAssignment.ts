import { haversineMeters } from '@/lib/geo/distance'
import { buildMetroSlug } from '@/lib/seo/metroCatalog'
import type { MetroAssignmentSaleInput, SeoMetroGeographyRow } from '@/lib/seo/metroGeographyTypes'

const METERS_PER_MILE = 1609.344

function radiusMeters(metro: SeoMetroGeographyRow): number {
  return metro.radius_miles * METERS_PER_MILE
}

function geographySlugSet(metros: SeoMetroGeographyRow[]): Set<string> {
  return new Set(metros.map((metro) => metro.slug))
}

/**
 * Assign a sale to exactly one metro slug using canonical geography.
 * With coordinates: nearest center within radius (tie-break slug asc).
 * Without coordinates: literal city/state slug when present in geography.
 */
export function assignMetroSlug(
  sale: MetroAssignmentSaleInput,
  metros: SeoMetroGeographyRow[]
): string | null {
  if (metros.length === 0) return null

  const lat = sale.lat
  const lng = sale.lng
  if (typeof lat === 'number' && typeof lng === 'number') {
    const candidates: Array<{ slug: string; distance: number }> = []
    for (const metro of metros) {
      const distance = haversineMeters(lat, lng, metro.center_lat, metro.center_lng)
      if (distance <= radiusMeters(metro)) {
        candidates.push({ slug: metro.slug, distance })
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance
        return a.slug.localeCompare(b.slug)
      })
      return candidates[0]!.slug
    }
  }

  if (!sale.city?.trim() || !sale.state?.trim()) return null
  const slug = buildMetroSlug(sale.city, sale.state)
  return geographySlugSet(metros).has(slug) ? slug : null
}

export function belongsToMetro(
  sale: MetroAssignmentSaleInput,
  metro: SeoMetroGeographyRow,
  metros: SeoMetroGeographyRow[]
): boolean {
  return assignMetroSlug(sale, metros) === metro.slug
}
