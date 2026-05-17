/**
 * Client-side fetch bbox preparation: expand viewport buffer and clamp to API limits.
 * Map viewport remains authoritative; only the data-fetch bbox may be clamped.
 */

import { expandBounds, normalizeBounds, type Bounds, MAP_BUFFER_FACTOR } from '@/lib/map/bounds'
import { MAX_BBOX_SPAN_DEGREES } from '@/lib/shared/bboxLimits'

export { MAX_BBOX_SPAN_DEGREES }

/** Zoom below which synthetic mapView bounds are unreliable; defer proactive fetch until Mapbox reports bounds. */
export const LOW_ZOOM_DEFER_PROACTIVE_THRESHOLD = 8

export type FetchBboxDebugReason =
  | 'initial_fetch_deferred_until_real_bounds'
  | 'fetch_bbox_clamped_to_api_limit'
  | 'bbox_too_large_ignored_preserving_existing_sales'

export function getBoundsSpanDegrees(bounds: Bounds): { latSpan: number; lngSpan: number } {
  return {
    latSpan: Math.abs(bounds.north - bounds.south),
    lngSpan: Math.abs(bounds.east - bounds.west),
  }
}

export function isLowZoomForDeferredFetch(zoom: number): boolean {
  return zoom < LOW_ZOOM_DEFER_PROACTIVE_THRESHOLD
}

/**
 * True when expanded viewport would exceed API max span (proactive fetch should wait for real bounds).
 */
export function viewportExceedsApiLimitAfterBuffer(viewportBounds: Bounds): boolean {
  const expanded = expandBounds(normalizeBounds(viewportBounds), MAP_BUFFER_FACTOR)
  const { latSpan, lngSpan } = getBoundsSpanDegrees(expanded)
  return latSpan > MAX_BBOX_SPAN_DEGREES || lngSpan > MAX_BBOX_SPAN_DEGREES
}

/**
 * Center-preserving clamp so lat/lng spans do not exceed API limit.
 */
export function clampBoundsToApiLimit(bounds: Bounds): { bounds: Bounds; wasClamped: boolean } {
  const normalized = normalizeBounds(bounds)
  const { latSpan, lngSpan } = getBoundsSpanDegrees(normalized)

  if (latSpan <= MAX_BBOX_SPAN_DEGREES && lngSpan <= MAX_BBOX_SPAN_DEGREES) {
    return { bounds: normalized, wasClamped: false }
  }

  const centerLat = (normalized.north + normalized.south) / 2
  const centerLng = (normalized.east + normalized.west) / 2
  const halfLat = Math.min(latSpan / 2, MAX_BBOX_SPAN_DEGREES / 2)
  const halfLng = Math.min(lngSpan / 2, MAX_BBOX_SPAN_DEGREES / 2)

  return {
    bounds: {
      south: centerLat - halfLat,
      north: centerLat + halfLat,
      west: centerLng - halfLng,
      east: centerLng + halfLng,
    },
    wasClamped: true,
  }
}

/**
 * Normalize viewport → expand buffer → clamp for /api/sales bbox params.
 */
export function prepareFetchBbox(viewportBounds: Bounds): {
  fetchBounds: Bounds
  wasClamped: boolean
} {
  const expanded = expandBounds(normalizeBounds(viewportBounds), MAP_BUFFER_FACTOR)
  const { bounds, wasClamped } = clampBoundsToApiLimit(expanded)
  return { fetchBounds: bounds, wasClamped }
}

export function logFetchBboxDebug(reason: FetchBboxDebugReason, context?: Record<string, unknown>): void {
  if (process.env.NEXT_PUBLIC_DEBUG !== 'true') return
  // eslint-disable-next-line no-console
  console.log('[FETCH_BBOX]', { reason, ...context })
}
