import {
  SOCIAL_REPORT_CANVAS_HEIGHT,
  SOCIAL_REPORT_CANVAS_WIDTH,
} from '@/lib/admin/social/socialReportCanvasDimensions'

/** Mapbox GL tile size (Web Mercator). */
const MAPBOX_TILE_SIZE = 512

export type ViewportBounds = {
  west: number
  south: number
  east: number
  north: number
}

export type ViewportCenterZoomInput = {
  centerLat: number
  centerLng: number
  zoom: number
  width?: number
  height?: number
}

function worldSizeForZoom(zoom: number): number {
  return MAPBOX_TILE_SIZE * 2 ** zoom
}

function pixelXFromLng(lng: number, worldSize: number): number {
  return ((lng + 180) / 360) * worldSize
}

function pixelYFromLat(lat: number, worldSize: number): number {
  const latRad = (lat * Math.PI) / 180
  const yNormalized =
    0.5 - Math.log((1 + Math.sin(latRad)) / (1 - Math.sin(latRad))) / (4 * Math.PI)
  return yNormalized * worldSize
}

function latFromPixelY(y: number, worldSize: number): number {
  const yNormalized = y / worldSize
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yNormalized)))
  return (latRad * 180) / Math.PI
}

function lngFromPixelX(x: number, worldSize: number): number {
  return (x / worldSize) * 360 - 180
}

/**
 * Geographic bounds for a fixed center/zoom and canvas size (Mapbox-compatible Web Mercator).
 */
export function buildViewportBoundsFromCenterZoom(
  input: ViewportCenterZoomInput
): ViewportBounds {
  const width = input.width ?? SOCIAL_REPORT_CANVAS_WIDTH
  const height = input.height ?? SOCIAL_REPORT_CANVAS_HEIGHT
  const worldSize = worldSizeForZoom(input.zoom)

  const centerX = pixelXFromLng(input.centerLng, worldSize)
  const centerY = pixelYFromLat(input.centerLat, worldSize)

  const west = lngFromPixelX(centerX - width / 2, worldSize)
  const east = lngFromPixelX(centerX + width / 2, worldSize)
  const north = latFromPixelY(centerY - height / 2, worldSize)
  const south = latFromPixelY(centerY + height / 2, worldSize)

  return {
    west: Math.min(west, east),
    south: Math.min(north, south),
    east: Math.max(west, east),
    north: Math.max(north, south),
  }
}
