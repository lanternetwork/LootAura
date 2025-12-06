/**
 * Bbox size validation utilities
 * Enforces maximum bbox size to prevent abuse and large queries
 */

/**
 * Maximum allowed bbox span in degrees (latitude and longitude)
 * ~10 degrees ≈ 1110km, which is reasonable for a yard sale discovery app
 * This prevents queries that span entire continents
 */
const MAX_BBOX_SPAN_DEGREES = 10

/**
 * Validate bbox size
 * Returns error message if bbox is too large, null if valid
 */
export function validateBboxSize(bbox: {
  north: number
  south: number
  east: number
  west: number
}): string | null {
  const latSpan = Math.abs(bbox.north - bbox.south)
  const lngSpan = Math.abs(bbox.east - bbox.west)

  if (latSpan > MAX_BBOX_SPAN_DEGREES) {
    return `Bounding box latitude span (${latSpan.toFixed(2)}°) exceeds maximum (${MAX_BBOX_SPAN_DEGREES}°)`
  }

  if (lngSpan > MAX_BBOX_SPAN_DEGREES) {
    return `Bounding box longitude span (${lngSpan.toFixed(2)}°) exceeds maximum (${MAX_BBOX_SPAN_DEGREES}°)`
  }

  return null
}

/**
 * Get bbox size summary for logging (rounded, no PII)
 */
export function getBboxSummary(bbox: {
  north: number
  south: number
  east: number
  west: number
}): {
  latSpan: number
  lngSpan: number
  centerLat: number
  centerLng: number
} {
  return {
    latSpan: Math.round((bbox.north - bbox.south) * 100) / 100,
    lngSpan: Math.round((bbox.east - bbox.west) * 100) / 100,
    centerLat: Math.round(((bbox.north + bbox.south) / 2) * 100) / 100,
    centerLng: Math.round(((bbox.east + bbox.west) / 2) * 100) / 100,
  }
}

