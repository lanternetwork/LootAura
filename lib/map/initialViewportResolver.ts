/**
 * Initial Viewport Resolver
 * 
 * Authority-aware precedence for resolving initial map viewport:
 * 
 * System Authority (cold start):
 *   Mobile: GPS-first (ignores persistence/cookies/URL params unless user-initiated)
 *   Desktop: URL params → persisted → IP fallback
 * 
 * User Authority:
 *   All sources ignored except explicit user actions
 * 
 * This consolidates all viewport resolution logic in one place to avoid scattered fallbacks.
 */

import { loadViewportState, type ViewportState } from './viewportPersistence'
import { isColdStart, isUserAuthority } from './authority'

export interface InitialViewportResult {
  viewport: ViewportState | null
  source: 'url' | 'persisted' | 'geo' | 'ip' | 'fallback' | 'user'
  center: { lat: number; lng: number } | null
  zoom: number | null
}

export interface ResolverOptions {
  urlLat: string | null
  urlLng: string | null
  urlZoom: string | null
  initialCenter: { lat: number; lng: number; label?: { zip?: string; city?: string; state?: string } } | null
  isMobile: boolean
  userInteracted: boolean
}

/**
 * Resolve initial viewport with authority-aware precedence
 */
export function resolveInitialViewport(options: ResolverOptions): InitialViewportResult {
  const { urlLat, urlLng, urlZoom, initialCenter, isMobile, userInteracted } = options

  const coldStart = isColdStart()
  const isUser = isUserAuthority()

  // If user authority, ignore all automatic sources
  // Only explicit user actions (URL params from user navigation) are allowed
  if (isUser) {
    // User authority: Only respect URL params if they exist (user-initiated navigation)
    // Ignore persistence, cookies, IP, GPS
    if (urlLat && urlLng) {
      const lat = parseFloat(urlLat)
      const lng = parseFloat(urlLng)
      const zoom = urlZoom ? parseFloat(urlZoom) : null

      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[VIEWPORT_RESOLVER] User authority: Using URL params:', { lat, lng, zoom })
        }
        return {
          viewport: zoom !== null ? { lat, lng, zoom } : null,
          source: 'url',
          center: { lat, lng },
          zoom
        }
      }
    }

    // User authority but no URL params: return null to preserve current map state
    // The component should not recenter
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[VIEWPORT_RESOLVER] User authority: No URL params, preserving current state')
    }
    return {
      viewport: null,
      source: 'user',
      center: null,
      zoom: null
    }
  }

  // System authority: Normal precedence rules apply
  // On mobile cold start: GPS-first (ignore persistence/cookies/URL params)
  // On desktop or non-cold-start: Normal precedence

  // Mobile cold start: GPS-first (ignore everything else)
  if (isMobile && coldStart) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[VIEWPORT_RESOLVER] Mobile cold start: GPS-first, ignoring persistence/cookies/URL params')
    }
    // Return geo signal to attempt GPS
    // GPS will be attempted even if persisted viewport exists
    return {
      viewport: null,
      source: 'geo',
      center: null,
      zoom: null
    }
  }

  // Desktop or non-cold-start: Normal precedence
  // 1) URL viewport params (if not mobile cold start)
  if (urlLat && urlLng) {
    const lat = parseFloat(urlLat)
    const lng = parseFloat(urlLng)
    const zoom = urlZoom ? parseFloat(urlZoom) : null

    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[VIEWPORT_RESOLVER] Using URL params:', { lat, lng, zoom })
      }
      return {
        viewport: zoom !== null ? { lat, lng, zoom } : null,
        source: 'url',
        center: { lat, lng },
        zoom
      }
    }
  }

  // 2) localStorage persisted viewport (only if not mobile cold start)
  const persisted = loadViewportState()
  if (persisted?.viewport) {
    const { viewport } = persisted
    if (
      !isNaN(viewport.lat) && !isNaN(viewport.lng) && !isNaN(viewport.zoom) &&
      viewport.lat >= -90 && viewport.lat <= 90 &&
      viewport.lng >= -180 && viewport.lng <= 180 &&
      viewport.zoom >= 0 && viewport.zoom <= 22
    ) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[VIEWPORT_RESOLVER] Using persisted viewport:', viewport)
      }
      return {
        viewport,
        source: 'persisted',
        center: { lat: viewport.lat, lng: viewport.lng },
        zoom: viewport.zoom
      }
    }
  }

  // 3) Mobile-only device geolocation (non-cold-start, no user interaction)
  // This is a signal that geolocation should be attempted, not the actual result
  if (isMobile && !userInteracted && !persisted) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[VIEWPORT_RESOLVER] Mobile detected, no persisted state - geolocation may be attempted')
    }
    return {
      viewport: null,
      source: 'geo',
      center: null,
      zoom: null
    }
  }

  // 4) IP-derived initialCenter fallback
  if (initialCenter?.lat && initialCenter?.lng) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[VIEWPORT_RESOLVER] Using IP-derived initialCenter:', initialCenter)
    }
    return {
      viewport: null,
      source: 'ip',
      center: { lat: initialCenter.lat, lng: initialCenter.lng },
      zoom: null
    }
  }

  // 5) Ultimate fallback (should rarely happen)
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[VIEWPORT_RESOLVER] Using neutral US center fallback')
  }
  return {
    viewport: null,
    source: 'fallback',
    center: { lat: 39.8283, lng: -98.5795 },
    zoom: null
  }
}
