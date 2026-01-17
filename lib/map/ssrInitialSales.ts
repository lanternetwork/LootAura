/**
 * Server-side helper to compute initial sales data matching client's first fetch
 * 
 * This replicates the exact logic used by the client for the first pin fetch:
 * 1. Computes initial viewport bounds (matching client's mapView initialization)
 * 2. Calculates buffered bounds (using expandBounds with MAP_BUFFER_FACTOR)
 * 3. Fetches sales by calling the API route internally (ensures 100% parity)
 * 
 * CRITICAL: This must match client behavior exactly to avoid data mismatches.
 */

import { expandBounds, type Bounds, MAP_BUFFER_FACTOR } from '@/lib/map/bounds'
import { Sale } from '@/lib/types'

/**
 * Distance to zoom level mapping (miles to zoom level)
 * Must match SalesClient.tsx distanceToZoom function exactly
 */
function distanceToZoom(distance: number): number {
  if (distance <= 1) return 15
  if (distance <= 2) return 14
  if (distance <= 5) return 13
  if (distance <= 10) return 12
  if (distance <= 15) return 11
  if (distance <= 25) return 10
  if (distance <= 50) return 9
  if (distance <= 75) return 8
  return 8
}

/**
 * Compute initial viewport bounds matching client's mapView initialization
 * 
 * Client logic (SalesClient.tsx lines 156-212):
 * - If resolvedViewport.viewport exists, use that zoom to calculate bounds
 * - Otherwise, use effectiveCenter + defaultDistance (10) + distanceToZoom
 * - Fallback to neutral US center
 */
function computeInitialViewportBounds(
  center: { lat: number; lng: number },
  urlZoom?: string | null
): Bounds {
  const defaultDistance = 10 // matches DEFAULT_FILTERS.distance
  const calculatedZoom = urlZoom ? parseFloat(urlZoom) : distanceToZoom(defaultDistance)
  const zoomLevel = calculatedZoom
  
  // Match client's latRange calculation exactly (lines 166, 186)
  const latRange = zoomLevel === 12 ? 0.11 : zoomLevel === 10 ? 0.45 : zoomLevel === 11 ? 0.22 : 1.0
  const lngRange = latRange * Math.cos(center.lat * Math.PI / 180)
  
  return {
    west: center.lng - lngRange / 2,
    south: center.lat - latRange / 2,
    east: center.lng + lngRange / 2,
    north: center.lat + latRange / 2
  }
}

/**
 * Fetch sales by calling the API route internally
 * This ensures 100% parity with client fetch logic
 */
async function fetchSalesForBbox(
  bufferedBbox: Bounds,
  baseUrl: string,
  options: {
    dateRange?: string
    categories?: string[]
    distanceKm?: number
  } = {}
): Promise<Sale[]> {
  
  // Build API URL with same params as client fetchMapSales (line 338-359)
  const params = new URLSearchParams()
  params.set('north', bufferedBbox.north.toString())
  params.set('south', bufferedBbox.south.toString())
  params.set('east', bufferedBbox.east.toString())
  params.set('west', bufferedBbox.west.toString())
  
  if (options.dateRange && options.dateRange !== 'any') {
    params.set('dateRange', options.dateRange)
  }
  if (options.categories && options.categories.length > 0) {
    params.set('categories', options.categories.join(','))
  }
  if (options.distanceKm) {
    params.set('radiusKm', options.distanceKm.toString())
  }
  
  // Request same limit as client (line 359)
  params.set('limit', '200')
  
  // Call API route internally
  // baseUrl should always be provided, but handle empty string gracefully
  if (!baseUrl) {
    // Return empty if no baseUrl (should not happen in production)
    return []
  }
  
  const response = await fetch(`${baseUrl}/api/sales?${params.toString()}`, {
    cache: 'no-store' // Ensure fresh data
  })
  
  if (!response.ok) {
    // Return empty on error (matching client error handling)
    return []
  }
  
  const data = await response.json() as { ok?: boolean; data?: unknown }
  
  if (!data || !data.ok || !Array.isArray(data.data)) {
    return []
  }
  
  // Deduplicate sales by ID (matching client's deduplicateSales logic)
  const seen = new Set<string>()
  const unique = (data.data as Sale[]).filter((sale: Sale) => {
    const canonicalId = sale.id
    if (seen.has(canonicalId)) {
      return false
    }
    seen.add(canonicalId)
    return true
  })
  
  return unique
}

export interface SSRInitialSalesResult {
  initialSales: Sale[]
  initialBufferedBounds: Bounds
}

/**
 * Compute initial sales data for SSR
 * 
 * This replicates the client's first fetch exactly:
 * 1. Computes initial viewport bounds from center + zoom
 * 2. Expands to buffered bounds using MAP_BUFFER_FACTOR
 * 3. Fetches sales with same filters as client
 * 
 * @param center - Initial map center (from page.tsx initialCenter resolution)
 * @param urlZoom - Optional zoom from URL params
 * @param filters - Optional filters (defaults match client DEFAULT_FILTERS)
 */
export async function computeSSRInitialSales(
  center: { lat: number; lng: number },
  baseUrl: string,
  urlZoom?: string | null,
  filters: {
    dateRange?: string
    categories?: string[]
    distance?: number
  } = {}
): Promise<SSRInitialSalesResult> {
  // Compute initial viewport bounds (matching client's mapView initialization)
  const viewportBounds = computeInitialViewportBounds(center, urlZoom)
  
  // Calculate buffered bounds (matching client's expandBounds call in handleViewportChange)
  const bufferedBounds = expandBounds(viewportBounds, MAP_BUFFER_FACTOR)
  
  // Convert distance from miles to km (matching client fetchMapSales line 354)
  const distanceKm = filters.distance ? filters.distance * 1.60934 : undefined
  
  // Fetch sales with same logic as client
  const sales = await fetchSalesForBbox(bufferedBounds, baseUrl, {
    dateRange: filters.dateRange || 'any',
    categories: filters.categories || [],
    distanceKm
  })
  
  return {
    initialSales: sales,
    initialBufferedBounds: bufferedBounds
  }
}
