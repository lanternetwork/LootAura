/**
 * Initial Viewport Resolver
 * 
 * Deterministic precedence for resolving initial map viewport:
 * 1) URL viewport params (lat/lng/zoom) - highest authority
 * 2) localStorage persisted viewport (if valid and not stale)
 * 3) (Mobile only) Device geolocation (if not denied and no user interaction)
 * 4) IP-derived initialCenter fallback
 * 
 * This consolidates all viewport resolution logic in one place to avoid scattered fallbacks.
 */

import { loadViewportState, type ViewportState } from './viewportPersistence'

export interface InitialViewportResult {
  viewport: ViewportState | null
  source: 'url' | 'persisted' | 'geo' | 'ip' | 'fallback'
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
 * Resolve initial viewport with deterministic precedence
 */
export function resolveInitialViewport(options: ResolverOptions): InitialViewportResult {
  const { urlLat, urlLng, urlZoom, initialCenter, isMobile, userInteracted } = options

  // 1) URL viewport params - highest authority
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

  // 2) localStorage persisted viewport
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

  // 3) Mobile-only device geolocation (only if no user interaction yet)
  // This is a signal that geolocation should be attempted, not the actual result
  // The actual geolocation happens in the component with proper gating
  if (isMobile && !userInteracted && !persisted) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[VIEWPORT_RESOLVER] Mobile detected, no persisted state - geolocation may be attempted')
    }
    // Return null viewport to signal that geolocation should be attempted
    // The component will handle the actual geolocation call
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
