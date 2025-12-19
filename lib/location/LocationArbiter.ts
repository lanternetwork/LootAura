/**
 * LocationArbiter - Resolves initial map location
 * 
 * Decides the initial center ONLY if no viewport exists yet.
 * Encapsulates location resolution priority logic.
 * 
 * Priority order:
 * 1. Explicit GPS (only when user clicks recenter - handled separately)
 * 2. URL parameters (lat, lng, zip)
 * 3. la_loc cookie
 * 4. profile.home_zip (requires user context)
 * 5. IP geolocation
 * 6. Fallback (US center)
 * 
 * Rules:
 * - Runs ONLY when MapViewportStore has no viewport
 * - Outputs: { lat, lng, zoom }
 * - Does NOT update viewport continuously
 * - Does NOT fight user interaction
 * - Does NOT re-run after initialization unless explicitly requested
 */

export interface InitialLocation {
  lat: number
  lng: number
  zoom: number
}

export interface LocationArbiterOptions {
  /** URL search params (client-side) */
  urlParams?: {
    lat?: string | null
    lng?: string | null
    zoom?: string | null
    zip?: string | null
  }
  /** Server-resolved initial center (from page.tsx) */
  serverInitialCenter?: { lat: number; lng: number; label?: { zip?: string; city?: string; state?: string } } | null
  /** User's home ZIP from profile (if available) */
  userHomeZip?: string | null
  /** Default zoom level if not specified */
  defaultZoom?: number
}

/**
 * Resolve initial location using priority chain
 * This is a pure function that can be called client-side
 */
export async function resolveInitialLocation(
  options: LocationArbiterOptions
): Promise<InitialLocation> {
  const {
    urlParams,
    serverInitialCenter,
    userHomeZip,
    defaultZoom = 12
  } = options

  // Helper to calculate zoom from distance (matches SalesClient logic)
  const distanceToZoom = (distance: number): number => {
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

  // Priority 0: URL parameters (lat, lng) - highest priority
  if (urlParams?.lat && urlParams?.lng) {
    const lat = parseFloat(urlParams.lat)
    const lng = parseFloat(urlParams.lng)
    const zoom = urlParams.zoom ? parseFloat(urlParams.zoom) : defaultZoom

    if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[LocationArbiter] Using URL parameters:', { lat, lng, zoom })
      }
      return { lat, lng, zoom }
    }
  }

  // Priority 0.5: URL ZIP parameter (needs client-side resolution)
  if (urlParams?.zip && !urlParams?.lat && !urlParams?.lng) {
    try {
      const zipRes = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(urlParams.zip)}`, {
        cache: 'no-store'
      })
      if (zipRes.ok) {
        const zipData = await zipRes.json()
        if (zipData?.ok && zipData.lat && zipData.lng) {
          const zoom = urlParams.zoom ? parseFloat(urlParams.zoom) : distanceToZoom(10)
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[LocationArbiter] Using URL ZIP lookup:', { lat: zipData.lat, lng: zipData.lng, zoom })
          }
          return { lat: zipData.lat, lng: zipData.lng, zoom }
        }
      }
    } catch (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[LocationArbiter] ZIP lookup failed:', error)
      }
    }
  }

  // Priority 1: Server-resolved initial center (from page.tsx)
  // This already includes la_loc cookie, profile.home_zip, IP geolocation, and fallback
  if (serverInitialCenter?.lat && serverInitialCenter?.lng) {
    const zoom = urlParams?.zoom ? parseFloat(urlParams.zoom) : defaultZoom
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[LocationArbiter] Using server initial center:', {
        lat: serverInitialCenter.lat,
        lng: serverInitialCenter.lng,
        zoom,
        source: 'server'
      })
    }
    return {
      lat: serverInitialCenter.lat,
      lng: serverInitialCenter.lng,
      zoom
    }
  }

  // Priority 2: User profile home_zip (if server didn't resolve it)
  if (userHomeZip) {
    try {
      const zipRes = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(userHomeZip)}`, {
        cache: 'no-store'
      })
      if (zipRes.ok) {
        const zipData = await zipRes.json()
        if (zipData?.ok && zipData.lat && zipData.lng) {
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[LocationArbiter] Using user home_zip:', { lat: zipData.lat, lng: zipData.lng, zoom: defaultZoom })
          }
          return { lat: zipData.lat, lng: zipData.lng, zoom: defaultZoom }
        }
      }
    } catch (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[LocationArbiter] User home_zip lookup failed:', error)
      }
    }
  }

  // Priority 3: IP geolocation (client-side fallback)
  try {
    const ipRes = await fetch('/api/geolocation/ip', { cache: 'no-store' })
    if (ipRes.ok) {
      const ipData = await ipRes.json()
      if (ipData?.lat && ipData?.lng) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[LocationArbiter] Using IP geolocation:', { lat: ipData.lat, lng: ipData.lng, zoom: defaultZoom })
        }
        return { lat: ipData.lat, lng: ipData.lng, zoom: defaultZoom }
      }
    }
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[LocationArbiter] IP geolocation failed:', error)
    }
  }

  // Priority 4: Fallback (US center)
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[LocationArbiter] Using fallback location:', { lat: 39.8283, lng: -98.5795, zoom: defaultZoom })
  }
  return { lat: 39.8283, lng: -98.5795, zoom: defaultZoom }
}

