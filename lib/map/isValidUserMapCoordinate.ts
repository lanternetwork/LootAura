/** Validate lat/lng for render-only map overlays (user location marker). */
export function isValidUserMapCoordinate(
  lat: unknown,
  lng: unknown
): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}
