/**
 * Strip viewport query params (lat, lng, zoom) from /sales map URLs only.
 * Used by the native shell so the app never launches into /sales with persisted
 * viewport params that would force source:"url" and block auto-geolocation.
 * All other routes and params are left unchanged.
 */

const VIEWPORT_PARAMS = ['lat', 'lng', 'zoom']

/**
 * When the URL path is exactly /sales (map entry, not sale detail), remove
 * lat, lng, and zoom from the query string. Preserve all other params.
 * Returns the original URL if path is not /sales or if parsing fails.
 */
export function stripSalesViewportParams(url: string): string {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.replace(/\/$/, '') || '/'
    if (pathname !== '/sales') return url

    const search = parsed.searchParams
    VIEWPORT_PARAMS.forEach((p) => search.delete(p))
    const newSearch = search.toString()
    parsed.search = newSearch
    return parsed.toString()
  } catch {
    return url
  }
}
