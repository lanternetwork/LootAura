const SCRIPT_LAT = /const\s+lat\s*=\s*([+-]?\d+(?:\.\d+)?)\s*;/i
const SCRIPT_LNG = /const\s+lng\s*=\s*([+-]?\d+(?:\.\d+)?)\s*;/i
const STREET_VIEW_CBLL = /cbll=([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)/i

export type YstmNativeCoordinateSource = 'script_const' | 'street_view_cbll'

export type YstmNativeCoordinates = {
  lat: number
  lng: number
  source: YstmNativeCoordinateSource
}

/**
 * Extract embedded coordinates from YSTM detail/list HTML.
 * Priority: `const lat` / `const lng` script vars, then Street View `cbll=` fallback.
 */
export function extractYstmNativeCoordinatesFromHtml(html: string): YstmNativeCoordinates | null {
  if (!html?.trim()) return null

  const latMatch = html.match(SCRIPT_LAT)
  const lngMatch = html.match(SCRIPT_LNG)
  if (latMatch && lngMatch) {
    const lat = Number(latMatch[1])
    const lng = Number(lngMatch[1])
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, source: 'script_const' }
    }
  }

  const cbll = html.match(STREET_VIEW_CBLL)
  if (cbll) {
    const lat = Number(cbll[1])
    const lng = Number(cbll[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, source: 'street_view_cbll' }
    }
  }

  return null
}
