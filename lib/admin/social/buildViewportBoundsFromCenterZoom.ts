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

function projectToWorldPixels(lat: number, lng: number, worldSize: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * worldSize
  const latRad = (lat * Math.PI) / 180
  const y =
    ((0.5 - Math.log((1 + Math.sin(latRad)) / (1 - Math.sin(latRad)))) / (4 * Math.PI)) *
    worldSize
  return { x, y }
}

function unprojectFromWorldPixels(
  x: number,
  y: number,
  worldSize: number
): { lat: number; lng: number } {
  const lng = (x / worldSize) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / worldSize
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return { lat, lng }
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
  const center = projectToWorldPixels(input.centerLat, input.centerLng, worldSize)

  const northWest = unprojectFromWorldPixels(
    center.x - width / 2,
    center.y - height / 2,
    worldSize
  )
  const southEast = unprojectFromWorldPixels(
    center.x + width / 2,
    center.y + height / 2,
    worldSize
  )

  return {
    west: northWest.lng,
    north: northWest.lat,
    east: southEast.lng,
    south: southEast.lat,
  }
}
