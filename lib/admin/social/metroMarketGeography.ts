import { assignMetroSlug } from '@/lib/seo/metroAssignment'
import type { SeoMetroGeographyRow } from '@/lib/seo/metroGeographyTypes'
import type { SeoMetro } from '@/lib/seo/types'

export type MetroMarketAnchor = {
  lat: number
  lng: number
}

export type MetroMarketBounds = {
  west: number
  south: number
  east: number
  north: number
}

type SaleGeoRow = {
  city?: string | null
  state?: string | null
  lat?: number | null
  lng?: number | null
}

export function geographyRowToAnchor(row: SeoMetroGeographyRow): MetroMarketAnchor {
  return { lat: row.center_lat, lng: row.center_lng }
}

/** Centroid of city/state-matched sales with coordinates. */
export function computeCentroidAnchor(rows: SaleGeoRow[]): MetroMarketAnchor | null {
  let sumLat = 0
  let sumLng = 0
  let count = 0
  for (const row of rows) {
    if (typeof row.lat !== 'number' || typeof row.lng !== 'number') continue
    sumLat += row.lat
    sumLng += row.lng
    count += 1
  }
  if (count === 0) return null
  return { lat: sumLat / count, lng: sumLng / count }
}

export function resolveMetroMarketAnchor(
  metro: SeoMetro,
  geography: SeoMetroGeographyRow | null,
  cityMatchedRows: SaleGeoRow[]
): MetroMarketAnchor | null {
  if (geography) return geographyRowToAnchor(geography)
  return computeCentroidAnchor(cityMatchedRows)
}

export function buildMetroMarketAnchorsBySlug(
  geographyRows: SeoMetroGeographyRow[]
): Record<string, MetroMarketAnchor | null> {
  const anchors: Record<string, MetroMarketAnchor | null> = {}
  for (const row of geographyRows) {
    anchors[row.slug] = geographyRowToAnchor(row)
  }
  return anchors
}

/** Bbox around metro anchor using geography radius. */
export function buildMarketBoundsAroundGeography(
  geography: SeoMetroGeographyRow
): MetroMarketBounds {
  const radiusMeters = geography.radius_miles * 1609.344
  const anchor = geographyRowToAnchor(geography)
  const latDelta = radiusMeters / 111_000
  const lngDelta = radiusMeters / (111_000 * Math.cos((anchor.lat * Math.PI) / 180))
  return {
    south: anchor.lat - latDelta,
    north: anchor.lat + latDelta,
    west: anchor.lng - lngDelta,
    east: anchor.lng + lngDelta,
  }
}

export function buildBoundsFromCoords(
  coords: Array<{ lat: number; lng: number }>
): MetroMarketBounds | null {
  if (coords.length === 0) return null
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const { lat, lng } of coords) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return { west, south, east, north }
}

/** @deprecated Use assignMetroSlug from lib/seo/metroAssignment */
export function resolveMetroSlugForSale(
  sale: SaleGeoRow,
  geographyRows: SeoMetroGeographyRow[]
): string | null {
  return assignMetroSlug(sale, geographyRows)
}

export function saleBelongsToMetroMarket(
  sale: SaleGeoRow,
  metroSlug: string,
  geographyRows: SeoMetroGeographyRow[]
): boolean {
  return assignMetroSlug(sale, geographyRows) === metroSlug
}
