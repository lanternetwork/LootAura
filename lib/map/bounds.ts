/**
 * Map bounds utilities for viewport + buffer loading strategy
 */

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

/**
 * Configuration constants for buffer behavior
 */
export const MAP_BUFFER_FACTOR = 1.8 // How much bigger than viewport the fetched box is
export const MAP_BUFFER_SAFETY_FACTOR = 0.8 // When to consider viewport "too close" to the edge

/**
 * Expands viewport bounds by a buffer factor to create a larger fetch area
 * 
 * @param viewportBounds - The current map viewport bounds
 * @param bufferFactor - Multiplier for expansion (default: MAP_BUFFER_FACTOR)
 * @returns Expanded bounds that fully contain the viewport
 */
export function expandBounds(
  viewportBounds: Bounds,
  bufferFactor: number = MAP_BUFFER_FACTOR
): Bounds {
  const centerLat = (viewportBounds.north + viewportBounds.south) / 2
  const centerLng = (viewportBounds.east + viewportBounds.west) / 2
  
  const latRange = viewportBounds.north - viewportBounds.south
  const lngRange = viewportBounds.east - viewportBounds.west
  
  const expandedLatRange = latRange * bufferFactor
  const expandedLngRange = lngRange * bufferFactor
  
  return {
    west: centerLng - expandedLngRange / 2,
    south: centerLat - expandedLatRange / 2,
    east: centerLng + expandedLngRange / 2,
    north: centerLat + expandedLatRange / 2
  }
}

/**
 * Checks if the viewport is safely inside the buffered bounds
 * Uses a safety factor to trigger refetch slightly before hitting the exact edge
 * 
 * @param viewportBounds - The current map viewport bounds
 * @param bufferedBounds - The buffered area we fetched sales for
 * @param safetyFactor - Factor to determine "safe" margin (default: MAP_BUFFER_SAFETY_FACTOR)
 * @returns true if viewport is comfortably inside buffered area
 */
export function isViewportInsideBounds(
  viewportBounds: Bounds,
  bufferedBounds: Bounds,
  safetyFactor: number = MAP_BUFFER_SAFETY_FACTOR
): boolean {
  if (!bufferedBounds) return false
  
  // Calculate margins on each side
  const westMargin = viewportBounds.west - bufferedBounds.west
  const eastMargin = bufferedBounds.east - viewportBounds.east
  const southMargin = viewportBounds.south - bufferedBounds.south
  const northMargin = bufferedBounds.north - viewportBounds.north
  
  // Calculate viewport dimensions
  const viewportWidth = viewportBounds.east - viewportBounds.west
  const viewportHeight = viewportBounds.north - viewportBounds.south
  
  // Calculate minimum required margins (safety factor of viewport size)
  const minMarginWest = viewportWidth * (1 - safetyFactor) / 2
  const minMarginEast = viewportWidth * (1 - safetyFactor) / 2
  const minMarginSouth = viewportHeight * (1 - safetyFactor) / 2
  const minMarginNorth = viewportHeight * (1 - safetyFactor) / 2
  
  // Check if all margins are sufficient
  return (
    westMargin >= minMarginWest &&
    eastMargin >= minMarginEast &&
    southMargin >= minMarginSouth &&
    northMargin >= minMarginNorth
  )
}

/**
 * Checks if a point [lng, lat] is inside the given bounds
 * 
 * @param point - Point as [longitude, latitude]
 * @param bounds - Mapbox-style bounds { west, south, east, north }
 * @returns true if point is inside bounds
 */
export function isPointInsideBounds(
  point: [number, number],
  bounds: Bounds
): boolean {
  const [lng, lat] = point
  
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  )
}

/**
 * Filters sales to only those within the viewport bounds
 * 
 * @param sales - Array of sales to filter
 * @param viewportBounds - The current map viewport bounds
 * @returns Sales that fall within the viewport
 */
export function filterSalesForViewport<T extends { lat?: number | null; lng?: number | null }>(
  sales: T[],
  viewportBounds: Bounds
): T[] {
  return sales.filter(sale => {
    if (typeof sale.lat !== 'number' || typeof sale.lng !== 'number') {
      return false
    }
    
    return (
      sale.lat >= viewportBounds.south &&
      sale.lat <= viewportBounds.north &&
      sale.lng >= viewportBounds.west &&
      sale.lng <= viewportBounds.east
    )
  })
}


