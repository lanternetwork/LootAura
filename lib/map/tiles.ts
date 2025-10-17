/**
 * Tile management for map prefetching
 * Provides deterministic tile ID generation and adjacent tile calculation
 */

export interface TileBounds {
  north: number
  south: number
  east: number
  west: number
}

export interface Viewport {
  sw: [number, number]
  ne: [number, number]
}

/**
 * Generate a deterministic tile ID for given bounds
 * Uses a simple grid system based on zoom level and geographic bounds
 */
export function tileIdForBounds(bounds: TileBounds, zoom: number): string {
  // Use a grid system based on zoom level
  const gridSize = Math.pow(2, Math.max(0, zoom - 8)) // Start grid at zoom 8
  const latStep = 180 / gridSize
  const lngStep = 360 / gridSize
  
  // Calculate grid coordinates
  const latIndex = Math.floor((bounds.north + 90) / latStep)
  const lngIndex = Math.floor((bounds.west + 180) / lngStep)
  
  return `${zoom}-${latIndex}-${lngIndex}`
}

/**
 * Get adjacent tile IDs for prefetching
 * Returns N, E, S, W adjacent tiles
 */
export function adjacentTileIds(tileId: string): string[] {
  const parts = tileId.split('-')
  if (parts.length !== 3) return []
  
  const [zoom, latIndex, lngIndex] = parts.map(Number)
  const gridSize = Math.pow(2, Math.max(0, zoom - 8))
  
  const adjacent: string[] = []
  
  // North (lat + 1)
  if (latIndex + 1 < gridSize) {
    adjacent.push(`${zoom}-${latIndex + 1}-${lngIndex}`)
  }
  
  // East (lng + 1)
  if (lngIndex + 1 < gridSize) {
    adjacent.push(`${zoom}-${latIndex}-${lngIndex + 1}`)
  }
  
  // South (lat - 1)
  if (latIndex - 1 >= 0) {
    adjacent.push(`${zoom}-${latIndex - 1}-${lngIndex}`)
  }
  
  // West (lng - 1)
  if (lngIndex - 1 >= 0) {
    adjacent.push(`${zoom}-${latIndex}-${lngIndex - 1}`)
  }
  
  return adjacent
}

/**
 * Convert viewport to tile bounds
 */
export function viewportToTileBounds(viewport: Viewport, zoom: number): TileBounds {
  return {
    north: viewport.ne[1],
    south: viewport.sw[1],
    east: viewport.ne[0],
    west: viewport.sw[0]
  }
}

/**
 * Get current tile ID from viewport
 */
export function getCurrentTileId(viewport: Viewport, zoom: number): string {
  const bounds = viewportToTileBounds(viewport, zoom)
  return tileIdForBounds(bounds, zoom)
}
