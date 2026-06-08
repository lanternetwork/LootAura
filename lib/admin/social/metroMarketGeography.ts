import { buildMetroSlug } from '@/lib/seo/metroCatalog'
import { haversineMeters } from '@/lib/geo/distance'
import type { SeoMetro } from '@/lib/seo/types'

/** Market-area radius around metro anchor (~35 mi). */
export const METRO_MARKET_RADIUS_METERS = 56_000

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

/** Canonical anchors for major metros (city center). */
const KNOWN_METRO_ANCHORS: Partial<Record<string, MetroMarketAnchor>> = {
  'chicago-il': { lat: 41.8781, lng: -87.6298 },
  'dallas-tx': { lat: 32.7767, lng: -96.797 },
  'houston-tx': { lat: 29.7604, lng: -95.3698 },
  'phoenix-az': { lat: 33.4484, lng: -112.074 },
  'atlanta-ga': { lat: 33.749, lng: -84.388 },
  'austin-tx': { lat: 30.2672, lng: -97.7431 },
  'louisville-ky': { lat: 38.2527, lng: -85.7585 },
}

export function getKnownMetroMarketAnchor(slug: string): MetroMarketAnchor | null {
  return KNOWN_METRO_ANCHORS[slug] ?? null
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
  cityMatchedRows: SaleGeoRow[]
): MetroMarketAnchor | null {
  return getKnownMetroMarketAnchor(metro.slug) ?? computeCentroidAnchor(cityMatchedRows)
}

/** Known metro anchors for market-area assignment (no DB). */
export function buildMetroMarketAnchorsBySlug(
  metros: SeoMetro[]
): Record<string, MetroMarketAnchor | null> {
  const anchors: Record<string, MetroMarketAnchor | null> = {}
  for (const metro of metros) {
    anchors[metro.slug] = getKnownMetroMarketAnchor(metro.slug)
  }
  return anchors
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

/**
 * Assign a sale to a metro slug using market geography:
 * 1. With coords: nearest metro anchor within radius (nationwide).
 * 2. Without coords: literal city/state slug when in catalog.
 */
export function resolveMetroSlugForSale(
  sale: SaleGeoRow,
  metros: SeoMetro[],
  anchorsBySlug: Record<string, MetroMarketAnchor | null>
): string | null {
  const lat = sale.lat
  const lng = sale.lng
  if (typeof lat === 'number' && typeof lng === 'number') {
    let bestSlug: string | null = null
    let bestDistance = Infinity
    for (const metro of metros) {
      const anchor = anchorsBySlug[metro.slug]
      if (!anchor) continue
      const distance = haversineMeters(lat, lng, anchor.lat, anchor.lng)
      if (distance <= METRO_MARKET_RADIUS_METERS && distance < bestDistance) {
        bestDistance = distance
        bestSlug = metro.slug
      }
    }
    if (bestSlug) return bestSlug
  }

  if (!sale.city?.trim() || !sale.state?.trim()) return null
  const slug = buildMetroSlug(sale.city, sale.state)
  return metros.some((m) => m.slug === slug) ? slug : null
}

export function saleBelongsToMetroMarket(
  sale: SaleGeoRow,
  metro: SeoMetro,
  anchor: MetroMarketAnchor | null,
  metros: SeoMetro[],
  anchorsBySlug: Record<string, MetroMarketAnchor | null>
): boolean {
  return resolveMetroSlugForSale(sale, metros, anchorsBySlug) === metro.slug
}
