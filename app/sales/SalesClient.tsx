'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import SimpleMap from '@/components/location/SimpleMap'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import SalesList from '@/components/SalesList'
import FiltersBar from '@/components/sales/FiltersBar'
import EmptyState from '@/components/EmptyState'
import MobileFilterSheet from '@/components/sales/MobileFilterSheet'
import MobileSalesShell from './MobileSalesShell'
import MobileSaleCallout from '@/components/sales/MobileSaleCallout'
import { useFilters, type DateRangeType } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'
import { createHybridPins } from '@/lib/pins/hybridClustering'
import { useMobileFilter } from '@/contexts/MobileFilterContext'
import { trackFiltersUpdated, trackPinClicked } from '@/lib/analytics/clarityEvents'
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/lib/keyboard/shortcuts'
import { 
  expandBounds, 
  isViewportInsideBounds, 
  filterSalesForViewport,
  type Bounds,
  MAP_BUFFER_FACTOR,
  MAP_BUFFER_SAFETY_FACTOR
} from '@/lib/map/bounds'
import { resolveInitialViewport } from '@/lib/map/initialViewportResolver'
import { saveViewportState } from '@/lib/map/viewportPersistence'
import { requestGeolocation, isGeolocationDenied, isGeolocationAvailable } from '@/lib/map/geolocation'
import { flipToUserAuthority, isUserAuthority, setMapAuthority } from '@/lib/map/authority'
import UseMyLocationButton from '@/components/map/UseMyLocationButton'
import { haversineMeters } from '@/lib/geo/distance'
import { checkGeolocationPermission } from '@/lib/location/client'
import { isDebugEnabled } from '@/lib/debug'

// Simplified map-as-source types
interface MapViewState {
  center: { lat: number; lng: number }
  bounds: { west: number; south: number; east: number; north: number }
  zoom: number
}


interface SalesClientProps {
  initialSales: Sale[]
  initialBufferedBounds: Bounds | null
  initialCenter: { lat: number; lng: number; label?: { zip?: string; city?: string; state?: string } } | null
  user: User | null
}

export default function SalesClient({ 
  initialSales, 
  initialBufferedBounds,
  initialCenter, 
  user: _user 
}: SalesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Track user interaction to prevent surprise recentering
  const userInteractedRef = useRef(false)
  const geolocationAttemptedRef = useRef(false)
  // Track when we're doing an imperative recenter to prevent reactive conflicts
  const isImperativeRecenterRef = useRef(false)
  // Track previous URL location params to prevent unnecessary viewport updates on filter changes
  const prevUrlLocationRef = useRef<{ lat: string | null; lng: string | null; zoom: string | null } | null>(null)
  
  // Single source of truth for last known user location
  const [lastUserLocation, setLastUserLocation] = useState<{ lat: number; lng: number; source: 'gps' | 'ip'; timestamp: number } | null>(null)
  const [hasLocationPermission, setHasLocationPermission] = useState(false)
  
  // Check location permission on mount and listen for changes
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const hasPermission = await checkGeolocationPermission()
        setHasLocationPermission(hasPermission)
      } catch (error) {
        // If permission check fails, assume no permission
        setHasLocationPermission(false)
      }
    }
    checkPermission()
    
    // Listen for permission changes
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(permission => {
        const updatePermission = () => {
          setHasLocationPermission(permission.state === 'granted')
        }
        updatePermission()
        permission.addEventListener('change', updatePermission)
        return () => permission.removeEventListener('change', updatePermission)
      }).catch(() => {
        // Permission query not supported, rely on checkPermission only
      })
    }
  }, [])

  // Centralized, validated, debounced la_loc cookie writer
  // Only persists high-confidence sources (GPS, user actions) - NOT IP-derived initialCenter on mobile
  const locationCookieWriteTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const writeLocationCookie = useCallback((
    lat: number,
    lng: number,
    source: 'gps' | 'user' | 'initial',
    metadata?: { zip?: string; city?: string; state?: string }
  ) => {
    // Validate coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        isNaN(lat) || isNaN(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180) {
      if (isDebugEnabled) {
        console.warn('[LOCATION_COOKIE] Invalid coordinates, skipping write:', { lat, lng, source })
      }
      return
    }
    
    // Clear existing timeout to debounce
    if (locationCookieWriteTimeoutRef.current) {
      clearTimeout(locationCookieWriteTimeoutRef.current)
    }
    
    // Debounce: Write after 1 second of no changes
    locationCookieWriteTimeoutRef.current = setTimeout(() => {
      try {
        const val = JSON.stringify({
          lat,
          lng,
          source, // Include source for debugging (readers only check lat/lng, so this is safe)
          zip: metadata?.zip,
          city: metadata?.city,
          state: metadata?.state,
        })
        
        // Set cookie with same options: 1 day expiry, SameSite=Lax, Path=/, Secure if HTTPS
        const expires = new Date()
        expires.setTime(expires.getTime() + 60 * 60 * 24 * 1000) // 1 day in milliseconds
        const secureFlag = typeof window !== 'undefined' && window.location.protocol === 'https:' ? ';Secure' : ''
        document.cookie = `la_loc=${encodeURIComponent(val)};expires=${expires.toUTCString()};path=/;SameSite=Lax${secureFlag}`
        
        if (isDebugEnabled) {
          console.log('[LOCATION_COOKIE] Written:', { lat, lng, source })
        }
      } catch (error) {
        if (isDebugEnabled) {
          console.warn('[LOCATION_COOKIE] Write failed:', error)
        }
      }
      
      locationCookieWriteTimeoutRef.current = null
    }, 1000) // 1 second debounce
  }, [isDebugEnabled])
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (locationCookieWriteTimeoutRef.current) {
        clearTimeout(locationCookieWriteTimeoutRef.current)
      }
    }
  }, [])
  
  // Helper function to check if map is centered on a location
  const isCenteredOnLocation = useCallback((
    mapCenter: { lat: number; lng: number },
    target: { lat: number; lng: number },
    thresholdMeters = 50
  ): boolean => {
    const distanceMeters = haversineMeters(mapCenter.lat, mapCenter.lng, target.lat, target.lng)
    return distanceMeters <= thresholdMeters
  }, [])
  
  // Check for URL parameters
  const urlLat = searchParams.get('lat')
  const urlLng = searchParams.get('lng')
  const urlZoom = searchParams.get('zoom')
  
  // Check if ZIP in URL needs client-side resolution
  const urlZip = searchParams.get('zip')
  const zipNeedsResolution = urlZip && !urlLat && !urlLng && 
    (!initialCenter || !initialCenter.label?.zip || initialCenter.label.zip !== urlZip.trim())
  
  // Distance to zoom level mapping (miles to zoom level)
  // Zoom levels approximate: 8=~100mi, 9=~50mi, 10=~25mi, 11=~12mi, 12=~6mi, 13=~3mi, 14=~1.5mi, 15=~0.75mi
  const distanceToZoom = (distance: number): number => {
    if (distance <= 1) return 15  // Very close - high zoom
    if (distance <= 2) return 14  // Close - high zoom
    if (distance <= 5) return 13  // Medium-close - medium-high zoom
    if (distance <= 10) return 12 // Medium - medium zoom
    if (distance <= 15) return 11 // Medium-far - medium-low zoom
    if (distance <= 25) return 10 // Far - low zoom
    if (distance <= 50) return 9  // Very far - very low zoom
    if (distance <= 75) return 8  // Extremely far - extremely low zoom
    return 8 // Default for 100+ miles
  }

  // Resolve initial viewport using deterministic precedence
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  const isMobile = windowWidth < 768
  
  const resolvedViewport = useMemo(() => {
    return resolveInitialViewport({
      urlLat,
      urlLng,
      urlZoom,
      initialCenter,
      isMobile,
      userInteracted: userInteractedRef.current
    })
  }, [urlLat, urlLng, urlZoom, initialCenter, isMobile])

  // Write la_loc from initialCenter ONLY if:
  // - Desktop (not mobile), OR
  // - Mobile but NOT IP-derived (i.e., resolvedViewport.source !== 'geo')
  // This prevents persisting IP-derived location on mobile cold start
  useEffect(() => {
    if (!initialCenter) return
    
    // On mobile, skip writing cookie from initialCenter if GPS is expected (IP-derived)
    if (isMobile && resolvedViewport.source === 'geo') {
      if (isDebugEnabled) {
        console.log('[LOCATION_COOKIE] Skipping initialCenter write on mobile (GPS-first mode)')
      }
      return
    }
    
    // Desktop or non-IP mobile: write cookie from initialCenter
    writeLocationCookie(
      initialCenter.lat,
      initialCenter.lng,
      'initial',
      initialCenter.label
    )
  }, [initialCenter, isMobile, resolvedViewport.source, writeLocationCookie, isDebugEnabled])

  // Use resolved viewport to determine effective center
  const effectiveCenter = resolvedViewport.center || initialCenter

  // Initialize filters with resolved center
  const { filters, updateFilters, clearFilters, hasActiveFilters: _hasActiveFilters } = useFilters(
    effectiveCenter?.lat && effectiveCenter?.lng ? { lat: effectiveCenter.lat, lng: effectiveCenter.lng } : undefined
  )

  // Track latest distance value to avoid stale closures in ZIP search
  const distanceRef = useRef<number>(filters.distance ?? 10)
  
  // Update ref whenever filters.distance changes
  useEffect(() => {
    distanceRef.current = filters.distance ?? 10
  }, [filters.distance])

  // Map view state - single source of truth
  // If ZIP needs resolution, wait before initializing map view to avoid showing wrong location
  // Otherwise, use resolved viewport
  const [mapView, setMapView] = useState<MapViewState | null>(() => {
    if (zipNeedsResolution) {
      // ZIP needs client-side resolution - don't show map yet
      return null
    }
    
    // Use resolved viewport if available
    if (resolvedViewport.viewport) {
      const { viewport } = resolvedViewport
      const zoomLevel = viewport.zoom
      const latRange = zoomLevel === 12 ? 0.11 : zoomLevel === 10 ? 0.45 : zoomLevel === 11 ? 0.22 : 1.0
      const lngRange = latRange * (viewport.lat ? Math.cos(viewport.lat * Math.PI / 180) : 1)
      
      return {
        center: { lat: viewport.lat, lng: viewport.lng },
        bounds: {
          west: viewport.lng - lngRange / 2,
          south: viewport.lat - latRange / 2,
          east: viewport.lng + lngRange / 2,
          north: viewport.lat + latRange / 2
        },
        zoom: viewport.zoom
      }
    }
    
    // Fallback: calculate from center and default zoom
    if (effectiveCenter) {
      const defaultDistance = 10 // matches DEFAULT_FILTERS.distance in useFilters
      const calculatedZoom = urlZoom ? parseFloat(urlZoom) : distanceToZoom(defaultDistance)
      const zoomLevel = calculatedZoom
      const latRange = zoomLevel === 12 ? 0.11 : zoomLevel === 10 ? 0.45 : zoomLevel === 11 ? 0.22 : 1.0
      const lngRange = latRange * (effectiveCenter.lat ? Math.cos(effectiveCenter.lat * Math.PI / 180) : 1)
      
      return {
        center: effectiveCenter,
        bounds: {
          west: effectiveCenter.lng - lngRange / 2,
          south: effectiveCenter.lat - latRange / 2,
          east: effectiveCenter.lng + lngRange / 2,
          north: effectiveCenter.lat + latRange / 2
        },
        zoom: calculatedZoom
      }
    }
    
    // Ultimate fallback
    return {
      center: { lat: 39.8283, lng: -98.5795 },
      bounds: {
        west: -98.5795 - 0.5,
        south: 39.8283 - 0.5,
        east: -98.5795 + 0.5,
        north: 39.8283 + 0.5
      },
      zoom: 10
    }
  })

  // Single source of truth for location icon visibility
  // Must be declared after mapView since it depends on it
  const shouldShowLocationIcon = useMemo(() => {
    // If permission not granted, show icon (to request permission)
    if (!hasLocationPermission) {
      return true
    }
    
    // If no last known location, show icon (can't confirm centeredness)
    if (!lastUserLocation) {
      return true
    }
    
    // If map center not available, show icon
    if (!mapView?.center) {
      return true
    }
    
    // Check if map is centered on user location (50m threshold to avoid flickering)
    const isCentered = isCenteredOnLocation(mapView.center, lastUserLocation, 50)
    
    // Show icon if NOT centered, hide if centered
    return !isCentered
  }, [hasLocationPermission, lastUserLocation, mapView?.center, isCenteredOnLocation])

  // Sales data state - map is source of truth
  // fetchedSales: All sales for the buffered area (larger than viewport)
  // visibleSales: Subset of fetchedSales that intersect current viewport (computed via useMemo)
  const [fetchedSales, setFetchedSales] = useState<Sale[]>(initialSales)
  const [bufferedBounds, setBufferedBounds] = useState<Bounds | null>(initialBufferedBounds)
  const [loading, setLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false) // Track if a fetch is in progress
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(initialSales.length > 0) // Track if initial load is complete
  
  // Track deleted sale IDs to filter them out immediately
  const deletedSaleIdsRef = useRef<Set<string>>(new Set())
  // Track pending create events that arrived before viewport was initialized
  const pendingCreateEventsRef = useRef<Array<{ id: string; lat?: number; lng?: number }>>([])
  const [zipError, setZipError] = useState<string | null>(null)
  const [, setMapMarkers] = useState<{id: string; title: string; lat: number; lng: number}[]>([])
  const [pendingBounds, setPendingBounds] = useState<{ west: number; south: number; east: number; north: number } | null>(null)
  const [_isZipSearching, setIsZipSearching] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [_isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  
  // Track window width for mobile detection (already declared above)

  // Compute viewport bounds object for buffer utilities (declared early for use in useEffect)
  const viewportBounds = useMemo((): Bounds | null => {
    if (!mapView?.bounds) return null
    return {
      west: mapView.bounds.west,
      south: mapView.bounds.south,
      east: mapView.bounds.east,
      north: mapView.bounds.north
    }
  }, [mapView?.bounds])
  
  // Filter out deleted sales from any fetched data
  const filterDeletedSales = useCallback((sales: Sale[]) => {
    return sales.filter((sale) => !deletedSaleIdsRef.current.has(sale.id))
  }, [])
  
  // Deduplicate sales by canonical sale ID
  const deduplicateSales = useCallback((sales: Sale[]): Sale[] => {
    const seen = new Set<string>()
    const unique = sales.filter(sale => {
      const canonicalId = sale.id
      if (seen.has(canonicalId)) {
        return false
      }
      seen.add(canonicalId)
      return true
    })
    
    if (isDebugEnabled && unique.length !== sales.length) {
      console.log('[DEDUPE] input=', sales.length, 'output=unique=', unique.length, 'keys=[', unique.slice(0, 3).map(s => s.id), '...]')
    }
    
    return unique
  }, [])

  // Request cancellation for preventing race conditions
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Track API calls for debugging single fetch path
  const apiCallCounterRef = useRef(0)

  // Fetch sales based on buffered bounds (not tight viewport)
  // This function now receives bufferedBounds, which are larger than the viewport
  // For ZIP search, use near=1 mode by passing null for bufferedBbox and providing nearOptions
  const fetchMapSales = useCallback(async (bufferedBbox: Bounds | null, customFilters?: any, nearOptions?: { useNear: true; lat: number; lng: number }) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController()
    
    // Increment API call counter for debugging
    apiCallCounterRef.current += 1
    const callId = apiCallCounterRef.current
    
    if (isDebugEnabled) {
      if (nearOptions) {
        console.log('[FETCH] fetchMapSales called with near=1 mode:', { lat: nearOptions.lat, lng: nearOptions.lng })
      } else {
        console.log('[FETCH] fetchMapSales called with buffered bbox:', bufferedBbox)
        console.log('[FETCH] Buffered bbox range:', {
          latRange: bufferedBbox!.north - bufferedBbox!.south,
          lngRange: bufferedBbox!.east - bufferedBbox!.west,
          center: {
            lat: (bufferedBbox!.north + bufferedBbox!.south) / 2,
            lng: (bufferedBbox!.east + bufferedBbox!.west) / 2
          }
        })
      }
      console.log('[FETCH] API Call #' + callId + (nearOptions ? ' - Near=1 fetch' : ' - Buffered fetch'))
    }
    
    // Set fetching state but keep old data visible
    setIsFetching(true)
    // Only set loading=true on initial load (when fetchedSales is empty)
    const isInitialLoad = fetchedSales.length === 0
    if (isInitialLoad) {
      setLoading(true)
      markPerformance('sales_fetch_start')
    }

    try {
      const params = new URLSearchParams()
      const activeFilters = customFilters || filters
      
      if (nearOptions) {
        // Use near=1 API path for ZIP search (respects radiusKm exactly)
        params.set('near', '1')
        params.set('lat', nearOptions.lat.toString())
        params.set('lng', nearOptions.lng.toString())
        
        // Pass distance filter to API (convert miles to km)
        if (activeFilters.distance) {
          const distanceKm = activeFilters.distance * 1.60934 // Convert miles to km
          params.set('radiusKm', distanceKm.toString())
        }
        
        if (isDebugEnabled) {
          console.log('[FETCH] Using near=1 path for ZIP search:', { lat: nearOptions.lat, lng: nearOptions.lng, radiusKm: activeFilters.distance ? activeFilters.distance * 1.60934 : 'none' })
        }
      } else {
        // Use bbox path for map pan/zoom (existing behavior)
        if (!bufferedBbox) {
          throw new Error('bufferedBbox is required when not using near=1 mode')
        }
        params.set('north', bufferedBbox.north.toString())
        params.set('south', bufferedBbox.south.toString())
        params.set('east', bufferedBbox.east.toString())
        params.set('west', bufferedBbox.west.toString())
        
        if (isDebugEnabled) {
          console.log('[FETCH] Buffered bbox area (degrees):', {
            latRange: bufferedBbox.north - bufferedBbox.south,
            lngRange: bufferedBbox.east - bufferedBbox.west,
            area: (bufferedBbox.north - bufferedBbox.south) * (bufferedBbox.east - bufferedBbox.west)
          })
        }
      }
      
      if (activeFilters.dateRange) {
        params.set('dateRange', activeFilters.dateRange)
      }
      if (activeFilters.categories && activeFilters.categories.length > 0) {
        params.set('categories', activeFilters.categories.join(','))
      }
      // Pass distance filter to API for bbox path (convert miles to km)
      // Note: For near=1 path, radiusKm is already set above
      if (!nearOptions && activeFilters.distance) {
        const distanceKm = activeFilters.distance * 1.60934 // Convert miles to km
        params.set('radiusKm', distanceKm.toString())
      }
      
      // Request more sales to show all pins in buffered area
      params.set('limit', '200')
      
      if (isDebugEnabled) {
        console.log('[FETCH] API URL:', `/api/sales?${params.toString()}`)
        if (!nearOptions) {
          console.log('[FETCH] Buffered fetch with bbox:', bufferedBbox)
        }
      }

      const response = await fetch(`/api/sales?${params.toString()}`, {
        signal: abortControllerRef.current.signal
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      // Validate API response shape before processing
      if (!data || typeof data !== 'object') {
        console.error('[FETCH] Invalid response shape:', data)
        console.error('[FETCH] Invalid response from server')
        return
      }
      
      if (data.ok && Array.isArray(data.data)) {
        if (isDebugEnabled) {
          console.log('[FETCH] API Response:', {
            ok: data.ok,
            dataCount: data.data.length,
            center: data.center,
            distanceKm: data.distanceKm,
            degraded: data.degraded,
            totalCount: data.totalCount,
            bufferedBbox: bufferedBbox
          })
        }
        
        const deduplicated = deduplicateSales(data.data)
        // Filter out deleted sales
        const filtered = filterDeletedSales(deduplicated)
        if (isDebugEnabled) {
          console.log('[FETCH] Sales received:', { 
            raw: data.data.length, 
            deduplicated: deduplicated.length,
            filtered: filtered.length,
            bufferedBbox: bufferedBbox
          })
        }
        
        // Replace fetchedSales with new data for this buffered area
        // This replaces the old buffered data, not merging (we want clean buffer boundaries)
        setFetchedSales(filtered)
        
        // Mark performance for initial load completion
        if (isInitialLoad) {
          markPerformance('sales_fetch_complete')
        }
        
        // Update bufferedBounds to track what area we fetched
        // For near=1 mode, calculate bounds from response or use null
        if (nearOptions) {
          // For near=1, we don't track bufferedBounds (server calculates bbox)
          // The response may include bbox info, but we'll let the map viewport drive bounds
          setBufferedBounds(null)
        } else {
          setBufferedBounds(bufferedBbox!)
        }
        
        setMapMarkers(prev => {
          const newMarkers = filtered
            .filter(sale => typeof sale.lat === 'number' && typeof sale.lng === 'number')
            .map(sale => ({
              id: sale.id,
              title: sale.title,
              lat: sale.lat!,
              lng: sale.lng!
            }))
          const merged = [...prev, ...newMarkers]
          // Deduplicate by ID
          return merged.filter((marker, index, self) => 
            index === self.findIndex(m => m.id === marker.id)
          )
        })
      } else {
        if (isDebugEnabled) {
          console.log('[FETCH] No data in response:', data)
        }
        // Only clear if this was the initial load, otherwise keep old data
        if (fetchedSales.length === 0) {
          setFetchedSales([])
          setMapMarkers([])
        }
      }
    } catch (error) {
      // Don't log errors for aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        if (isDebugEnabled) {
          console.log('[FETCH] Request aborted (newer request started)')
        }
        return
      }
      console.error('[FETCH] Map sales error:', error)
      // On error, only clear if no data exists, otherwise keep old data visible
      if (fetchedSales.length === 0) {
        setFetchedSales([])
      }
    } finally {
      setLoading(false)
      setIsFetching(false)
      // Mark that initial load has completed after first fetch attempt
      if (!hasCompletedInitialLoad) {
        setHasCompletedInitialLoad(true)
        if (isInitialLoad) {
          markPerformance('sales_initial_load_complete')
        }
      }
    }
  }, [filters.dateRange, filters.categories, deduplicateSales, filterDeletedSales, fetchedSales.length])
  
  // Listen for sales:mutated events to filter out deleted sales and refetch on create
  useEffect(() => {
    const handleSalesMutated = (event: CustomEvent) => {
      const detail = event.detail
      if (detail?.type === 'delete' && detail?.id) {
        // Mark sale as deleted
        deletedSaleIdsRef.current.add(detail.id)
        // Remove from fetchedSales immediately
        setFetchedSales((prev) => prev.filter((s) => s.id !== detail.id))
      } else if (detail?.type === 'create' && detail?.id) {
        // Remove from deleted set if it was recreated
        deletedSaleIdsRef.current.delete(detail.id)
        
        // Store the create event for processing when viewport is ready
        const createEvent = {
          id: detail.id,
          lat: detail.lat ? (typeof detail.lat === 'number' ? detail.lat : parseFloat(detail.lat)) : undefined,
          lng: detail.lng ? (typeof detail.lng === 'number' ? detail.lng : parseFloat(detail.lng)) : undefined,
        }
        pendingCreateEventsRef.current.push(createEvent)
        
        // If we have viewport bounds, check if we should refetch immediately
        if (viewportBounds && bufferedBounds) {
          let shouldRefetch = false
          
          if (createEvent.lat && createEvent.lng) {
            // Check if sale is within current viewport bounds
            const isWithinViewport = 
              createEvent.lat >= viewportBounds.south &&
              createEvent.lat <= viewportBounds.north &&
              createEvent.lng >= viewportBounds.west &&
              createEvent.lng <= viewportBounds.east
            
            if (isWithinViewport) {
              shouldRefetch = true
              if (isDebugEnabled) {
                console.log('[SALES] New sale created within viewport, refetching:', { saleId: createEvent.id, lat: createEvent.lat, lng: createEvent.lng })
              }
            }
          } else {
            // Location not provided - refetch to be safe
            shouldRefetch = true
            if (isDebugEnabled) {
              console.log('[SALES] New sale created (location unknown), refetching to be safe:', { saleId: createEvent.id })
            }
          }
          
          if (shouldRefetch) {
            fetchMapSales(bufferedBounds)
          }
        }
      }
    }
    
    window.addEventListener('sales:mutated', handleSalesMutated as EventListener)
    return () => {
      window.removeEventListener('sales:mutated', handleSalesMutated as EventListener)
    }
  }, [viewportBounds, bufferedBounds, fetchMapSales])
  
  // Update mapView when URL params change (e.g., when navigating back from sale detail)
  // This ensures map position persists across navigation
  // Only updates when location params actually change, not on filter-only URL updates
  useEffect(() => {
    // Authority-based check: Skip viewport sync if this is a filter-only update
    // Check history.state for filterUpdate flag (set by useFilters.updateFilters)
    const historyState = typeof window !== 'undefined' ? window.history.state : null
    if (historyState && typeof historyState === 'object' && 'filterUpdate' in historyState && historyState.filterUpdate === true) {
      // This is a filter-only update - skip viewport sync
      if (isDebugEnabled) {
        console.log('[VIEWPORT_SYNC] Skipping viewport sync - filter-only update detected in history.state')
      }
      // Clear the flag after checking (one-time use)
      if (typeof window !== 'undefined') {
        try {
          window.history.replaceState(null, '', window.location.href)
        } catch {
          // Ignore errors
        }
      }
      return
    }
    
    // Check if location params actually changed (not just filter params)
    const currentLocation = { lat: urlLat, lng: urlLng, zoom: urlZoom }
    const prevLocation = prevUrlLocationRef.current
    
    // If location params haven't changed, skip update (filter-only change)
    if (prevLocation && 
        prevLocation.lat === currentLocation.lat && 
        prevLocation.lng === currentLocation.lng && 
        prevLocation.zoom === currentLocation.zoom) {
      return
    }
    
    // Update ref for next comparison
    prevUrlLocationRef.current = currentLocation
    
    // Only update if we have valid URL params and they differ from current mapView
    if (urlLat && urlLng) {
      const newLat = parseFloat(urlLat)
      const newLng = parseFloat(urlLng)
      const newZoom = urlZoom ? parseFloat(urlZoom) : distanceToZoom(10)
      
      // DIAGNOSTIC LOG - Desktop only
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        console.log('[VIEWPORT_CHANGE: URL_PARAMS] Trigger: URL location params changed', {
          trigger: 'URL params change',
          context: { urlLat, urlLng, urlZoom, newLat, newLng, newZoom },
          stack: new Error().stack
        })
      }
      
      // Use functional update to compare with current state
      setMapView(prev => {
        // Check if URL params differ from current mapView
        const centerChanged = !prev?.center || 
          Math.abs(prev.center.lat - newLat) > 0.0001 || 
          Math.abs(prev.center.lng - newLng) > 0.0001
        const zoomChanged = !prev || Math.abs(prev.zoom - newZoom) > 0.01
        
        if (!centerChanged && !zoomChanged) {
          // No change needed, return current state
          return prev
        }
        
        if (isDebugEnabled) {
          console.log('[MAP_VIEW] Updating mapView from URL params:', { newLat, newLng, newZoom })
        }
        
        // Calculate bounds based on zoom level
        const zoomLevel = newZoom
        const latRange = zoomLevel === 12 ? 0.11 : zoomLevel === 10 ? 0.45 : zoomLevel === 11 ? 0.22 : 1.0
        const lngRange = latRange * Math.cos(newLat * Math.PI / 180)
        
        return {
          center: { lat: newLat, lng: newLng },
          bounds: {
            west: newLng - lngRange / 2,
            south: newLat - latRange / 2,
            east: newLng + lngRange / 2,
            north: newLat + latRange / 2
          },
          zoom: newZoom
        }
      })
    }
  }, [urlLat, urlLng, urlZoom])

  // Initialize bufferedBounds if we have initial sales and map view
  // This prevents unnecessary refetch on first viewport change
  useEffect(() => {
    if (initialSales.length > 0 && mapView?.bounds && !bufferedBounds) {
      // Estimate that initial sales were fetched for a buffered area around initial viewport
      const initialBufferedBounds = expandBounds({
        west: mapView.bounds.west,
        south: mapView.bounds.south,
        east: mapView.bounds.east,
        north: mapView.bounds.north
      }, MAP_BUFFER_FACTOR)
      setBufferedBounds(initialBufferedBounds)
      if (isDebugEnabled) {
        console.log('[BUFFER] Initialized bufferedBounds from initial sales:', initialBufferedBounds)
      }
    }
  }, [initialSales.length, mapView?.bounds, bufferedBounds])

  // Process pending create events when viewport becomes available
  useEffect(() => {
    if (viewportBounds && bufferedBounds && pendingCreateEventsRef.current.length > 0) {
      const pendingEvents = [...pendingCreateEventsRef.current]
      pendingCreateEventsRef.current = []
      
      // Check if any pending events are within viewport
      const shouldRefetch = pendingEvents.some(event => {
        if (event.lat && event.lng) {
          return (
            event.lat >= viewportBounds.south &&
            event.lat <= viewportBounds.north &&
            event.lng >= viewportBounds.west &&
            event.lng <= viewportBounds.east
          )
        }
        // If location unknown, assume it might be in viewport
        return true
      })
      
      if (shouldRefetch) {
        if (isDebugEnabled) {
          console.log('[SALES] Processing pending create events, refetching:', { count: pendingEvents.length })
        }
        fetchMapSales(bufferedBounds)
      }
    }
  }, [viewportBounds, bufferedBounds, fetchMapSales])
  
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Hybrid system: Get current viewport for clustering
  const currentViewport = useMemo(() => {
    if (!mapView || !mapView.bounds) return null
    
        return {
      bounds: [
        mapView.bounds.west,
        mapView.bounds.south,
        mapView.bounds.east,
        mapView.bounds.north
      ] as [number, number, number, number],
      zoom: mapView.zoom
    }
  }, [mapView?.bounds, mapView?.zoom])


  // Derive visibleSales from fetchedSales filtered by current viewport
  // This is the key to smooth panning - we filter locally without refetching
  const visibleSales = useMemo(() => {
    if (!viewportBounds || fetchedSales.length === 0) {
      return []
    }
    return filterSalesForViewport(fetchedSales, viewportBounds)
  }, [fetchedSales, viewportBounds])

  // Performance marker helper (debug-only)
  const markPerformance = useCallback((name: string) => {
    if (isDebugEnabled && typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name)
      const measureName = `${name}_measure`
      if (performance.getEntriesByName(measureName).length === 0) {
        try {
          performance.measure(measureName, 'navigationStart', name)
          const measure = performance.getEntriesByName(measureName)[0]
          console.log(`[PERF] ${name}:`, `${Math.round(measure.duration)}ms`)
        } catch (e) {
          // Ignore measurement errors
        }
      }
    }
  }, [])

  // Mark first render
  useEffect(() => {
    markPerformance('sales_page_first_render')
  }, [markPerformance])

  // Hybrid system: Create location groups and apply clustering
  // DEFERRED: Run clustering after first paint to improve initial load time
  const [hybridResult, setHybridResult] = useState<ReturnType<typeof createHybridPins>>({
    type: 'individual' as const,
    pins: [],
    locations: [],
    clusters: []
  })
  const [clusteringDeferred, setClusteringDeferred] = useState(true)
  
  // Defer clustering until after first paint
  useEffect(() => {
    if (clusteringDeferred) {
      // Use requestIdleCallback if available, otherwise setTimeout
      const scheduleClustering = () => {
        if (!currentViewport || visibleSales.length === 0) {
          setHybridResult({
            type: 'individual' as const,
            pins: [],
            locations: [],
            clusters: []
          })
          setClusteringDeferred(false)
          return
        }
        
        if (isDebugEnabled) {
          console.log('[HYBRID] Clustering (deferred)', visibleSales.length, 'visible sales out of', fetchedSales.length, 'total fetched')
        }
        
        // Only run clustering on visible sales - touch-only clustering
        // Pins are 12px diameter (6px radius), so cluster only when centers are within 12px (pins exactly touch)
        const result = createHybridPins(visibleSales, currentViewport, {
          coordinatePrecision: 6, // high precision to avoid accidental grouping
          clusterRadius: 6.5, // px: touch-only - cluster only when pins actually touch (12px apart = edge-to-edge)
          minClusterSize: 2, // allow clustering for 2+ points
          maxZoom: 16,
          enableLocationGrouping: true,
          enableVisualClustering: true
        })
        
        if (isDebugEnabled) {
          console.log('[HYBRID] Clustering completed (deferred):', {
            type: result.type,
            pinsCount: result.pins.length,
            locationsCount: result.locations.length,
            visibleSalesCount: visibleSales.length,
            totalFetchedCount: fetchedSales.length
          })
        }
        
        setHybridResult(result)
        setClusteringDeferred(false)
        markPerformance('sales_map_clustering_complete')
      }
      
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(scheduleClustering, { timeout: 100 })
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(scheduleClustering, 0)
      }
    }
  }, [clusteringDeferred, currentViewport, visibleSales, fetchedSales.length, markPerformance])
  
  // Update clustering when inputs change (after initial deferral)
  useEffect(() => {
    if (!clusteringDeferred) {
      // Re-cluster on viewport/sales changes (after initial deferral)
      if (currentViewport && visibleSales.length > 0) {
        const result = createHybridPins(visibleSales, currentViewport, {
          coordinatePrecision: 6,
          clusterRadius: 6.5,
          minClusterSize: 2,
          maxZoom: 16,
          enableLocationGrouping: true,
          enableVisualClustering: true
        })
        setHybridResult(result)
      } else {
        setHybridResult({
          type: 'individual' as const,
          pins: [],
          locations: [],
          clusters: []
        })
      }
    }
  }, [clusteringDeferred, currentViewport, visibleSales])

  // Preloaded bounds - track the area we've already loaded sales for
  const preloadedBoundsRef = useRef<{ west: number; south: number; east: number; north: number } | null>(null)
  
  // Helper function to calculate bbox for a radius in miles
  // TODO: Use this when implementing preloading feature
  const _calculateRadiusBbox = useCallback((center: { lat: number; lng: number }, radiusMiles: number) => {
    const radiusKm = radiusMiles * 1.60934 // Convert miles to km
    const latRange = radiusKm / 111.0
    const lngRange = radiusKm / (111.0 * Math.cos(center.lat * Math.PI / 180))
    return {
      west: center.lng - lngRange,
      south: center.lat - latRange,
      east: center.lng + lngRange,
      north: center.lat + latRange
    }
  }, [])
  
  // Check if a bbox is within the preloaded bounds
  // TODO: Use this when implementing preloading feature
  const _isWithinPreloadedBounds = useCallback((bbox: { west: number; south: number; east: number; north: number }) => {
    if (!preloadedBoundsRef.current) return false
    const preloaded = preloadedBoundsRef.current
    // Check if the viewport bbox is completely within the preloaded bounds
    return (
      bbox.west >= preloaded.west &&
      bbox.south >= preloaded.south &&
      bbox.east <= preloaded.east &&
      bbox.north <= preloaded.north
    )
  }, [])

  // Debounce timer for viewport changes
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastBoundsRef = useRef<{ west: number; south: number; east: number; north: number } | null>(null)
  const initialLoadRef = useRef(true) // Track if this is the initial load
  // Track when we're programmatically centering to a pin to prevent clearing selection
  const isCenteringToPinRef = useRef<{ locationId: string; lat: number; lng: number } | null>(null)

  // Handle live viewport updates during map drag (onMove) - updates rendering only, no fetch
  // NOTE: Do NOT clear selection here - it blocks map dragging. Clear only on moveEnd.
  const handleViewportMove = useCallback(({ center, zoom, bounds }: { center: { lat: number; lng: number }, zoom: number, bounds: { west: number; south: number; east: number; north: number } }) => {
    // Mark user interaction on any map movement and flip authority to user
    userInteractedRef.current = true
    flipToUserAuthority()
    
    // Update map view state immediately for live rendering
    // This triggers viewportBounds and visibleSales recomputation via useMemo
    // Do NOT clear selection here - it causes blocking during drag
    setMapView(prev => {
      // DIAGNOSTIC LOG - Desktop only
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        console.log('[VIEWPORT_CHANGE: VIEWPORT_MOVE] Trigger: Map drag/move (live update)', {
          trigger: 'Map drag/move',
          context: { center, zoom, bounds },
          stack: new Error().stack
        })
      }
      
      if (!prev) {
        const radiusKm = 16.09 // 10 miles
        const latRange = radiusKm / 111.0
        const lngRange = radiusKm / (111.0 * Math.cos(center.lat * Math.PI / 180))
        return {
          center,
          bounds: {
            west: center.lng - lngRange,
            south: center.lat - latRange,
            east: center.lng + lngRange,
            north: center.lat + latRange
          },
          zoom
        }
      }
      return {
        ...prev,
        center,
        zoom,
        bounds
      }
    })
  }, [])

  // Persist map view to localStorage whenever it changes (for browser back button)
  // Don't update URL params here to avoid conflicts with URL param restoration
  useEffect(() => {
    if (mapView) {
      saveViewportState(
        { lat: mapView.center.lat, lng: mapView.center.lng, zoom: mapView.zoom },
        {
          dateRange: filters.dateRange || 'any',
          categories: filters.categories || [],
          radius: filters.distance || 10
        }
      )
    }
  }, [mapView, filters.dateRange, filters.categories, filters.distance])

  // Handle viewport changes from SimpleMap (onMoveEnd) - includes fetch decision logic
  // Core buffer logic: only fetch when viewport exits buffered area
  const handleViewportChange = useCallback(({ center, zoom, bounds }: { center: { lat: number; lng: number }, zoom: number, bounds: { west: number; south: number; east: number; north: number } }) => {
    // Skip URL update if we're in the middle of an imperative recenter
    // This prevents the viewport resolver from triggering another easeTo conflict
    const skipUrlUpdate = isImperativeRecenterRef.current
    
    const viewportBounds: Bounds = {
      west: bounds.west,
      south: bounds.south,
      east: bounds.east,
      north: bounds.north
    }
    
    if (isDebugEnabled) {
      console.log('[SALES] handleViewportChange called with:', {
        center,
        zoom,
        bounds: viewportBounds,
        boundsRange: {
          latRange: bounds.north - bounds.south,
          lngRange: bounds.east - bounds.west
        },
        bufferedBounds,
        isInsideBuffer: bufferedBounds ? isViewportInsideBounds(viewportBounds, bufferedBounds, MAP_BUFFER_SAFETY_FACTOR) : false,
        hasPendingBounds: !!pendingBounds
      })
    }
    
    // If fitBounds is active (pendingBounds is set), update the zoom in mapView
    // This ensures that when pendingBounds is cleared, the map already has the correct zoom
    // This prevents the zoom-out flash that happens when pendingBounds clears
    if (pendingBounds) {
      setMapView(prev => {
        // DIAGNOSTIC LOG - Desktop only
        if (typeof window !== 'undefined' && window.innerWidth >= 768) {
          console.log('[VIEWPORT_CHANGE: PENDING_BOUNDS] Trigger: fitBounds active (pendingBounds)', {
            trigger: 'fitBounds active',
            context: { center, zoom, bounds, pendingBounds },
            stack: new Error().stack
          })
        }
        
        if (!prev) {
          return {
            center,
            bounds,
            zoom
          }
        }
        return {
          ...prev,
          center,
          zoom, // Update zoom to match what fitBounds calculated
          bounds
        }
      })
      // Don't proceed with fetch logic while fitBounds is active
      return
    }
    
    // If a single location is selected and the user moves the map, exit location view
    // BUT: Don't clear if this is a programmatic centering (we want to keep the callout visible)
    // Check if we're currently centering to this pin
    const isCenteringToThisPin = isCenteringToPinRef.current && 
      isCenteringToPinRef.current.locationId === selectedPinId
    
    if (selectedPinId && hybridResult && !isCenteringToThisPin) {
      const selectedLocation = hybridResult.locations.find((loc: any) => loc.id === selectedPinId)
      if (selectedLocation) {
        // Check if the new center is close to the selected pin (within ~0.01 degrees, ~1km)
        // Use larger threshold to account for offsets and animation intermediate positions
        const latDiff = Math.abs(center.lat - selectedLocation.lat)
        const lngDiff = Math.abs(center.lng - selectedLocation.lng)
        const isNearSelectedPin = latDiff < 0.01 && lngDiff < 0.01
        
        // Only clear if this is NOT near the selected pin (user manually moved map away)
        if (!isNearSelectedPin) {
          setSelectedPinId(null)
        }
      } else {
        // No matching location found, clear selection
        setSelectedPinId(null)
      }
    }

    // Update map view state
    const newMapView: MapViewState = (() => {
      if (!mapView) {
        // If mapView is null, create a new view with the provided center
        const radiusKm = 16.09 // 10 miles
        const latRange = radiusKm / 111.0
        const lngRange = radiusKm / (111.0 * Math.cos(center.lat * Math.PI / 180))
        return {
          center,
          bounds: {
            west: center.lng - lngRange,
            south: center.lat - latRange,
            east: center.lng + lngRange,
            north: center.lat + latRange
          },
          zoom
        }
      }
      return {
        ...mapView,
        center,
        zoom,
        bounds
      }
    })()
    
    // DIAGNOSTIC LOG - Desktop only (before setMapView call)
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      console.log('[VIEWPORT_CHANGE: VIEWPORT_CHANGE] Trigger: Map viewport change (onMoveEnd)', {
        trigger: 'Map viewport change (onMoveEnd)',
        context: { center, zoom, bounds, bufferedBounds, skipUrlUpdate },
        stack: new Error().stack
      })
    }
    
    setMapView(newMapView)
    
    // Update URL params to keep them in sync (for browser back button)
    // Only update if this is a user-initiated change (not from URL param restoration)
    // Skip URL update during imperative recenter to prevent resolver conflicts
    if (!skipUrlUpdate) {
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('lat', center.lat.toFixed(6))
      params.set('lng', center.lng.toFixed(6))
      params.set('zoom', zoom.toFixed(2))
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
      // Clear filterUpdate flag when location changes (authority-based)
      // Use history.replaceState to clear the flag
      try {
        window.history.replaceState(null, '', newUrl)
      } catch {
        // Fallback to router.replace
        router.replace(newUrl, { scroll: false })
      }
      
      // Persist user-driven viewport change to cookie (high-confidence source)
      // Only write if user has interacted (not programmatic change)
      if (userInteractedRef.current || isUserAuthority()) {
        writeLocationCookie(center.lat, center.lng, 'user')
      }
    } else if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[FORCE_RECENTER] Skipping URL update during imperative recenter')
    }

    // Buffer-based fetch logic: only fetch when viewport exits buffered area
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    // Debounce buffer check by 200ms to balance responsiveness
    debounceTimerRef.current = setTimeout(() => {
      // Check if we need to fetch based on buffer
      const needsFetch = !bufferedBounds || !isViewportInsideBounds(viewportBounds, bufferedBounds, MAP_BUFFER_SAFETY_FACTOR)
      
      if (needsFetch) {
        // Compute new buffered bounds around current viewport
        const newBufferedBounds = expandBounds(viewportBounds, MAP_BUFFER_FACTOR)
        
        if (isDebugEnabled) {
          console.log('[SALES] Viewport outside buffer - fetching new buffered area:', {
            viewportBounds,
            oldBufferedBounds: bufferedBounds,
            newBufferedBounds
          })
        }
        
        // Fetch with buffered bounds (larger than viewport)
        fetchMapSales(newBufferedBounds)
      } else {
        // Viewport is inside buffer - no fetch needed
        // visibleSales will be automatically computed from fetchedSales via useMemo
        if (isDebugEnabled) {
          console.log('[SALES] Viewport inside buffer - using cached data, no fetch')
        }
      }
      
      // Persist viewport state (debounced to avoid localStorage churn)
      // Only persist if viewport is valid and user has interacted (not initial load)
      if (!initialLoadRef.current && center && zoom && bounds) {
        try {
          // Map distance to radius for persistence schema compatibility
          saveViewportState(
            { lat: center.lat, lng: center.lng, zoom },
            {
              dateRange: filters.dateRange || 'any',
              categories: filters.categories || [],
              radius: filters.distance || 10
            }
          )
          if (isDebugEnabled) {
            console.log('[PERSISTENCE] Saved viewport state:', { lat: center.lat, lng: center.lng, zoom })
          }
        } catch (error) {
          // Silently fail - persistence errors are handled in saveViewportState
          if (isDebugEnabled) {
            console.warn('[PERSISTENCE] Failed to save viewport:', error)
          }
        }
      }
      
      lastBoundsRef.current = bounds
      initialLoadRef.current = false // Mark initial load as complete
    }, 200)
  }, [bufferedBounds, fetchMapSales, selectedPinId, hybridResult, pendingBounds, filters.dateRange, filters.categories, filters.distance, writeLocationCookie])

  // Imperative function to force recenter map to a location
  // This bypasses all guards (isUserDragging, fitBounds, authority checks) and directly moves the map
  // Used ONLY for explicit user-initiated location requests
  // NOTE: Must be defined after handleViewportChange since it depends on it
  const forceRecenterToLocation = useCallback((
    map: any, // Mapbox map instance from mapRef.current.getMap()
    lat: number,
    lng: number,
    source: 'user'
  ) => {
    if (!map) {
      if (isDebugEnabled) {
        console.warn('[FORCE_RECENTER] Map instance not available')
      }
      return
    }

    if (isDebugEnabled) {
      console.log(`[FORCE_RECENTER] Imperative recenter to:`, { lat, lng, source })
    }

    const defaultDistance = 10
    const calculatedZoom = distanceToZoom(defaultDistance)

    // 1. Set flag BEFORE any state updates to prevent reactive updates
    isImperativeRecenterRef.current = true

    // 2. Flip authority explicitly to 'user' (before state updates to prevent conflicts)
    setMapAuthority('user')

    // 3. Imperative move - MUST happen first, bypasses all guards
    // DIAGNOSTIC LOG - Desktop only
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      console.log('[VIEWPORT_CHANGE: FORCE_RECENTER] Trigger: Force recenter to location (imperative)', {
        trigger: 'Force recenter (imperative)',
        context: { lat, lng, source, calculatedZoom },
        stack: new Error().stack
      })
    }
    
    map.easeTo({
      center: [lng, lat],
      zoom: calculatedZoom,
      essential: true, // Ensure the animation completes
      duration: 400
    })

    // 4. DON'T update mapView state here - let onMoveEnd handle it naturally
    // This prevents SimpleMap from reacting to prop changes and calling easeTo again
    // The map is already moving imperatively, so we don't need to trigger reactive updates

    // 5. Persist viewport state (but don't update URL - handleViewportChange will skip it)
    saveViewportState(
      { lat, lng, zoom: calculatedZoom },
      {
        dateRange: filters.dateRange || 'any',
        categories: filters.categories || [],
        radius: filters.distance || 10
      }
    )

    // 6. Clear flag after animation completes + URL update cycle (longer timeout to prevent resolver conflicts)
    // The map animation (400ms) + onMoveEnd + handleViewportChange + potential URL resolver cycle
    setTimeout(() => {
      isImperativeRecenterRef.current = false
    }, 1000)

    // 7. Let the map's onMoveEnd handler naturally call handleViewportChange after animation
    // handleViewportChange will skip URL updates due to isImperativeRecenterRef flag
    // This prevents the viewport resolver from triggering another easeTo
  }, [filters.dateRange, filters.categories, filters.distance, distanceToZoom, setMapView, setMapAuthority, saveViewportState])

  // Unified function to recenter map to user's GPS location
  // source: 'auto' = automatic GPS (subject to authority guard)
  // source: 'user' = user-initiated GPS (always recenters, bypasses authority)
  // NOTE: Must be defined after handleViewportChange since it depends on it
  const recenterToUserLocation = useCallback((location: { lat: number; lng: number }, source: 'auto' | 'user') => {
    // For automatic GPS, check authority guard
    if (source === 'auto') {
      // Only recenter if authority is still system (user hasn't taken control)
      if (isUserAuthority() || userInteractedRef.current) {
        if (isDebugEnabled) {
          console.log('[GEO] Location found but authority is user or user has interacted, not recentering (auto)')
        }
        return false
      }
    }
    // For user-initiated GPS, always recenter (no authority check)

    if (isDebugEnabled) {
      console.log(`[GEO] Recentering map to user location (source: ${source}):`, location)
    }

    const defaultDistance = 10
    const calculatedZoom = distanceToZoom(defaultDistance)
    const latRange = calculatedZoom === 12 ? 0.11 : calculatedZoom === 10 ? 0.45 : calculatedZoom === 11 ? 0.22 : 1.0
    const lngRange = latRange * Math.cos(location.lat * Math.PI / 180)

    const newBounds = {
      west: location.lng - lngRange / 2,
      south: location.lat - latRange / 2,
      east: location.lng + lngRange / 2,
      north: location.lat + latRange / 2
    }

    // DIAGNOSTIC LOG - Desktop only (before setMapView call)
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      console.log('[VIEWPORT_CHANGE: USER_LOCATION] Trigger: Recenter to user location', {
        trigger: 'Recenter to user location',
        context: { location, source, newBounds, calculatedZoom },
        stack: new Error().stack
      })
    }

    // Update map view state directly
    setMapView({
      center: { lat: location.lat, lng: location.lng },
      bounds: newBounds,
      zoom: calculatedZoom
    })

    // Trigger viewport change handler to update URL, fetch data, and persist
    handleViewportChange({
      center: { lat: location.lat, lng: location.lng },
      zoom: calculatedZoom,
      bounds: newBounds
    })

    // Persist the new viewport (map distance to radius for persistence schema)
    saveViewportState(
      { lat: location.lat, lng: location.lng, zoom: calculatedZoom },
      {
        dateRange: filters.dateRange || 'any',
        categories: filters.categories || [],
        radius: filters.distance || 10
      }
    )

    return true
  }, [filters.dateRange, filters.categories, filters.distance, handleViewportChange])

  // Track map visibility for deferred geolocation
  const [mapVisible, setMapVisible] = useState(false)
  
  // Mark when map becomes visible (for performance tracking)
  useEffect(() => {
    if (mapView && !mapVisible) {
      setMapVisible(true)
      markPerformance('sales_map_visible')
    }
  }, [mapView, mapVisible, markPerformance])

  // Mobile geolocation prompting (DEFERRED: only after map is visible or user interaction)
  // NOTE: Must be defined after recenterToUserLocation since it depends on it
  // 
  // IMPORTANT: Automatic GPS vs User-Initiated GPS
  // - Automatic GPS (this useEffect): Uses reactive recenterToUserLocation with source: 'auto'
  //   Subject to authority guard - will NOT recenter if user has taken control
  // - User-Initiated GPS (handleUseMyLocation/handleUserLocationRequest): Uses imperative forceRecenterToLocation
  //   Bypasses ALL guards - always recenters regardless of authority state
  useEffect(() => {
    // Only attempt on mobile, if resolver indicated geolocation should be attempted
    if (!isMobile || resolvedViewport.source !== 'geo') {
      return
    }

    // DEFERRED: Wait for map to be visible before requesting geolocation
    // This improves initial load time by not blocking on GPS permission prompt
    if (!mapVisible && !userInteractedRef.current) {
      return
    }

    // Don't attempt if already attempted or user has interacted
    if (geolocationAttemptedRef.current || userInteractedRef.current) {
      return
    }

    // Don't attempt if geolocation is denied
    if (isGeolocationDenied()) {
      if (isDebugEnabled) {
        console.log('[GEO] Skipping geolocation - previously denied')
      }
      return
    }

    // Don't attempt if geolocation API not available
    if (!isGeolocationAvailable()) {
      if (isDebugEnabled) {
        console.log('[GEO] Skipping geolocation - API not available')
      }
      return
    }

    // Mark as attempted to prevent duplicate requests
    geolocationAttemptedRef.current = true

    if (isDebugEnabled) {
      console.log('[GEO] Attempting mobile geolocation (auto, deferred)')
    }

    markPerformance('sales_geolocation_request_start')

    requestGeolocation({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000 // 5 minutes
    })
      .then((location) => {
        markPerformance('sales_geolocation_request_complete')
        
        // Store last known user location (triggers visibility recomputation)
        setLastUserLocation({ lat: location.lat, lng: location.lng, source: 'gps', timestamp: Date.now() })
        // Update permission state immediately (GPS success means permission was granted)
        setHasLocationPermission(true)
        
        // Persist GPS location to cookie (high-confidence source)
        writeLocationCookie(location.lat, location.lng, 'gps')
        
        // Check if map is already centered on this location before attempting recenter
        const isAlreadyCentered = mapView?.center ? isCenteredOnLocation(mapView.center, location, 50) : false
        
        // Automatic GPS: Use reactive recenterToUserLocation with source: 'auto'
        // This applies authority guard - will NOT recenter if user has taken control
        // Do NOT use forceRecenterToLocation here - automatic GPS must respect guards
        const didRecenter = recenterToUserLocation(location, 'auto')
        
        // Ensure visibility recomputes after auto-geolocation success, even if map doesn't move
        // This handles the case where auto-prompt grants permission and map is already at user location
        if (!didRecenter && isAlreadyCentered && mapView) {
          // Map is already centered, force a state update to trigger visibility recomputation
          // Use a timestamp-based update to ensure React sees it as a change
          setMapView(prev => prev ? { ...prev, zoom: prev.zoom } : null)
        } else if (didRecenter) {
          // If we did recenter, mapView is already updated, but ensure visibility recomputes
          // by triggering a small state update (React will dedupe if truly unchanged)
          setMapView(prev => prev ? { ...prev } : null)
        }
      })
      .catch((error) => {
        if (isDebugEnabled) {
          console.log('[GEO] Geolocation error:', error)
        }
        // Error handling (denial tracking) is done in requestGeolocation
      })
  }, [isMobile, resolvedViewport.source, recenterToUserLocation, mapVisible, markPerformance, writeLocationCookie])

  // Handle ZIP search with near=1 API path (respects distance filter exactly)
  const handleZipLocationFound = useCallback((lat: number, lng: number, city?: string, state?: string, zip?: string, _bbox?: [number, number, number, number]) => {
    // ZIP search is explicit user intent - flip authority to user immediately
    flipToUserAuthority()
    setZipError(null)
    setIsZipSearching(true) // Prevent map view changes from overriding ZIP search
    // Don't show transition overlay - just update map directly
    
    if (isDebugEnabled) {
      console.log('[ZIP] Updating map center to:', { lat, lng, zip, city, state })
      console.log('[ZIP] Received coordinates:', { lat, lng })
    }
    
    // Use current distance filter as single source of truth
    // Read from ref to ensure we always have the latest value, avoiding stale closures
    const distanceMiles = distanceRef.current
    
    // Calculate bounds for map viewport display (server will calculate exact bbox from radiusKm)
    const radiusKm = distanceMiles * 1.60934 // Convert miles to kilometers
    const latRange = radiusKm / 111.0
    const lngRange = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180))
    
    // Calculate bounds based on selected distance (for map viewport only)
    const calculatedBounds = {
      west: lng - lngRange,
      south: lat - latRange,
      east: lng + lngRange,
      north: lat + latRange
    }
    
    // Fetch sales data using near=1 API path (respects radiusKm exactly, no double expansion)
    // This ensures pins appear within the exact selected distance
    if (isDebugEnabled) {
      console.log('[ZIP] Fetching sales for ZIP location using near=1:', { lat, lng, distanceMiles, radiusKm })
    }
    fetchMapSales(null, filters, { useNear: true, lat, lng }).catch(err => {
      console.error('[ZIP] Failed to fetch sales:', err)
    })
    
    // Initialize or update map center - handle null prev state
    setMapView(prev => {
      // DIAGNOSTIC LOG - Desktop only
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        console.log('[VIEWPORT_CHANGE: ZIP_LOCATION] Trigger: ZIP location found/resolved', {
          trigger: 'ZIP location resolution',
          context: { lat, lng, zip, city, state, distanceMiles },
          stack: new Error().stack
        })
      }
      
      // Calculate appropriate zoom from selected distance
      // But let fitBounds determine the exact zoom to show the distance radius bounds
      const estimatedZoom = distanceToZoom(distanceMiles) // Use selected distance
      
      if (!prev) {
        // Create new map view with ZIP location
        // Let fitBounds calculate the exact zoom to show the selected distance radius
        const newView: MapViewState = {
          center: { lat, lng },
          bounds: calculatedBounds,
          zoom: estimatedZoom // Initial zoom, fitBounds will adjust via onViewportChange
        }
        if (isDebugEnabled) {
          console.log('[ZIP] New map view:', newView, 'calculatedBounds:', calculatedBounds)
        }
        
        // Use fitBounds to ensure exactly the selected distance radius is visible
        // Set bounds immediately - map will apply when loaded
        setPendingBounds(calculatedBounds)
        // Clear after fitBounds animation completes (300ms duration + buffer)
        // onViewportChange will update the zoom before this clears, preventing zoom flash
        setTimeout(() => {
          if (isDebugEnabled) {
            console.log('[ZIP] Clearing pendingBounds after fitBounds applied')
          }
          setPendingBounds(null)
        }, 500) // Reduced from 1000ms to 500ms (300ms animation + 200ms buffer)
        
        return newView
      }
      
      // Update existing map view
      const newView: MapViewState = {
        ...prev,
        center: { lat, lng },
        bounds: calculatedBounds,
        zoom: estimatedZoom // Initial zoom, fitBounds will adjust via onViewportChange
      }
      if (isDebugEnabled) {
        console.log('[ZIP] Updated map view:', newView, 'calculatedBounds:', calculatedBounds)
      }
      
      // Use fitBounds to ensure exactly the selected distance radius is visible
      // Set bounds - map will apply when ready
      setPendingBounds(calculatedBounds)
      // Clear after fitBounds animation completes (300ms duration + buffer)
      // onViewportChange will update the zoom before this clears, preventing zoom flash
      setTimeout(() => {
        if (isDebugEnabled) {
          console.log('[ZIP] Clearing pendingBounds after fitBounds applied')
        }
        setPendingBounds(null)
      }, 500) // Reduced from 1000ms to 500ms (300ms animation + 200ms buffer)
      
      return newView
    })

    // Update URL with ZIP parameter
    const currentParams = new URLSearchParams(searchParams.toString())
    if (zip) {
      currentParams.set('zip', zip)
      } else {
      currentParams.delete('zip')
    }
    router.replace(`/sales?${currentParams.toString()}`, { scroll: false })

    // Don't clear bounds immediately - let them persist to maintain the exact distance radius
    // Only clear if user manually pans/zooms (handled by handleViewportChange)
    
    // Map will update directly without transition overlay

    // Sales are already prefetched above, viewport change will refetch if needed
    
    // Clear the ZIP search flag after a delay to allow map to settle
    setTimeout(() => {
      setIsZipSearching(false)
    }, 1000)
  }, [searchParams, router, fetchMapSales, filters])

  const handleZipError = useCallback((error: string) => {
    setZipError(error)
  }, [])

  // Inverse function: zoom level to distance (miles)
  // This ensures the distance dropdown matches the actual zoom level on first load
  const zoomToDistance = (zoom: number): number => {
    if (zoom >= 15) return 1
    if (zoom >= 14) return 2
    if (zoom >= 13) return 5
    if (zoom >= 12) return 10
    if (zoom >= 11) return 15
    if (zoom >= 10) return 25
    if (zoom >= 9) return 50
    if (zoom >= 8) return 75
    return 100 // Default for zoom < 8
  }

  // Handle filter changes
  const handleFiltersChange = (newFilters: any) => {
    // Check if this is a distance change
    if (newFilters.distance && newFilters.distance !== filters.distance) {
      // Distance filter change that recenters the map is user intent
      flipToUserAuthority()
      if (isDebugEnabled) {
        console.log('[DISTANCE] Distance filter changed:', { 
          oldDistance: filters.distance, 
          newDistance: newFilters.distance,
          currentCenter: mapView?.center,
          currentBounds: mapView?.bounds
        })
      }
      
      // Update filters for UI state
      updateFilters(newFilters)
      
      // Calculate new bounds based on current center and new distance
      if (mapView?.center) {
        const distanceKm = newFilters.distance * 1.60934 // Convert miles to km
        const latRange = distanceKm / 111.0
        const lngRange = distanceKm / (111.0 * Math.cos(mapView.center.lat * Math.PI / 180))
        
        const newBounds = {
          west: mapView.center.lng - lngRange,
          south: mapView.center.lat - latRange,
          east: mapView.center.lng + lngRange,
          north: mapView.center.lat + latRange
        }
        
        const newZoom = distanceToZoom(newFilters.distance)
        
        if (isDebugEnabled) {
          console.log('[DISTANCE] Calculating new bounds:', {
            center: mapView.center,
            distanceKm,
            newBounds,
            newZoom
          })
        }
        
        // Update map view with new bounds and zoom
        setMapView(prev => {
          // DIAGNOSTIC LOG - Desktop only
          if (typeof window !== 'undefined' && window.innerWidth >= 768) {
            console.log('[VIEWPORT_CHANGE: FILTER_DISTANCE] Trigger: Distance filter changed', {
              trigger: 'Distance filter change',
              context: { 
                oldDistance: filters.distance, 
                newDistance: newFilters.distance,
                currentCenter: mapView?.center,
                newBounds,
                newZoom
              },
              stack: new Error().stack
            })
          }
          
          if (!prev) {
            return {
              center: { lat: 39.8283, lng: -98.5795 },
              bounds: newBounds,
              zoom: newZoom
            }
          }
          return {
            ...prev,
            bounds: newBounds,
            zoom: newZoom
          }
        })
        
        // Use fitBounds to smoothly update the view to show the new distance
        // This prevents the zoom in/out flicker
        setPendingBounds(newBounds)
        setTimeout(() => {
          if (isDebugEnabled) {
            console.log('[DISTANCE] Clearing pendingBounds after fitBounds applied')
          }
          setPendingBounds(null)
        }, 800) // Give map time to apply bounds
        
        // Trigger immediate refetch with new distance filter
        const newBufferedBounds = expandBounds(newBounds, MAP_BUFFER_FACTOR)
        fetchMapSales(newBufferedBounds, newFilters)
      } else {
        // No center yet, just update zoom
        const newZoom = distanceToZoom(newFilters.distance)
        setMapView(prev => {
          // DIAGNOSTIC LOG - Desktop only
          if (typeof window !== 'undefined' && window.innerWidth >= 768) {
            console.log('[VIEWPORT_CHANGE: FILTER_DISTANCE_NO_CENTER] Trigger: Distance filter changed (no center)', {
              trigger: 'Distance filter change (no center)',
              context: { 
                oldDistance: filters.distance, 
                newDistance: newFilters.distance,
                newZoom
              },
              stack: new Error().stack
            })
          }
          
          if (!prev) {
            return {
              center: { lat: 39.8283, lng: -98.5795 },
              bounds: {
                west: -98.5795 - 1.0,
                south: 39.8283 - 1.0,
                east: -98.5795 + 1.0,
                north: 39.8283 + 1.0
              },
              zoom: newZoom
            }
          }
          return {
            ...prev,
            zoom: newZoom
          }
        })
      }
      
      return
    }
    
    // For other filter changes (date, categories), treat as new dataset
    // Reset buffer and fetch new buffered area with new filters
    updateFilters(newFilters) // Keep URL update for filter state
    
    // Track Clarity event for filter update
    trackFiltersUpdated({
      zip: newFilters.city,
      dateRange: newFilters.dateRange,
      distanceMiles: newFilters.distance,
      categoriesCount: newFilters.categories?.length,
      hasFavoritesFilter: false, // TODO: Add if favorites filter is implemented
    })
    
    if (mapView?.bounds) {
      // Compute buffered bounds from current viewport
      const viewportBounds: Bounds = {
        west: mapView.bounds.west,
        south: mapView.bounds.south,
        east: mapView.bounds.east,
        north: mapView.bounds.north
      }
      const newBufferedBounds = expandBounds(viewportBounds, MAP_BUFFER_FACTOR)
      
      if (isDebugEnabled) {
        console.log('[FILTERS] Filter change - fetching new buffered area with filters:', {
          newFilters,
          viewportBounds,
          newBufferedBounds
        })
      }
      
      // Fetch with buffered bounds and new filters
      // Old data stays visible during fetch (no clearing)
      fetchMapSales(newBufferedBounds, newFilters)
    }
  }

  // Initial fetch will be triggered by map onLoad event with proper bounds

  // Sync distance filter with initial zoom level on first load only
  // This ensures the distance dropdown shows the correct value matching the actual zoom level
  // IMPORTANT: This should only run once on initial load, not when user zooms the map
  const hasSyncedDistanceRef = useRef(false)
  useEffect(() => {
    if (!mapView || hasSyncedDistanceRef.current) return // Wait for map view to be initialized, and only run once
    
    // Get the initial zoom level (from URL or default)
    const initialZoom = mapView.zoom
    
    // Calculate the distance that corresponds to this zoom level
    const correspondingDistance = zoomToDistance(initialZoom)
    
    // Only update if the current distance doesn't match the zoom level
    // This prevents unnecessary updates if the distance was already set from URL params
    if (filters.distance !== correspondingDistance) {
      // Check if distance was explicitly set in URL params
      const urlDistance = searchParams.get('dist')
      if (!urlDistance) {
        // No distance in URL, so sync with zoom level
        updateFilters({ distance: correspondingDistance }, true) // skipUrlUpdate to prevent URL change
        if (isDebugEnabled) {
          console.log('[DISTANCE] Synced distance filter with initial zoom:', { zoom: initialZoom, distance: correspondingDistance })
        }
      }
    }
    
    // Mark as synced so this only runs once
    hasSyncedDistanceRef.current = true
  // Only run once on mount when mapView is initialized
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapView])

  // Restore ZIP or city name from URL on page load only (not on every URL change)
  // Skip if initialCenter already matches ZIP (server-side lookup succeeded)
  const [hasRestoredZip, setHasRestoredZip] = useState(false)
  useEffect(() => {
    if (hasRestoredZip) return // Only run once on mount
    
    const zipFromUrl = searchParams.get('zip')
    // Only lookup ZIP/city client-side if:
    // 1. There's a ZIP/city in URL
    // 2. No lat/lng in URL
    // 3. InitialCenter doesn't already have the correct location (server-side lookup might have failed)
    const needsClientSideLookup = zipFromUrl && !urlLat && !urlLng && 
      (!initialCenter || !initialCenter.label?.zip || initialCenter.label.zip !== zipFromUrl.trim())
    
    if (needsClientSideLookup) {
      // Trigger ZIP or city name lookup from URL
      if (isDebugEnabled) {
        console.log('[ZIP] Restoring from URL:', zipFromUrl)
      }
      
      const performLocationLookup = async () => {
        const trimmedQuery = zipFromUrl.trim()
        const zipRegex = /^\d{5}(-\d{4})?$/
        
        // First, try ZIP code lookup if it matches ZIP format
        if (zipRegex.test(trimmedQuery)) {
          try {
            const response = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(trimmedQuery)}`)
            const data = await response.json()
            
            if (data.ok && data.lat && data.lng) {
              if (isDebugEnabled) {
                console.log('[ZIP] Lookup success from URL:', { zip: trimmedQuery, lat: data.lat, lng: data.lng })
              }
              
              // Use the same handler as manual ZIP input
              const bbox = data.bbox ? [data.bbox[0], data.bbox[1], data.bbox[2], data.bbox[3]] as [number, number, number, number] : undefined
              handleZipLocationFound(data.lat, data.lng, data.city, data.state, data.zip, bbox)
              setHasRestoredZip(true)
              return
            } else {
              if (isDebugEnabled) {
                console.warn('[ZIP] ZIP lookup failed from URL, trying city name geocoding:', trimmedQuery, data.error)
              }
            }
          } catch (error) {
            if (isDebugEnabled) {
              console.error('[ZIP] ZIP lookup error from URL, trying city name geocoding:', trimmedQuery, error)
            }
          }
        }
        
        // If ZIP lookup failed or query is not a ZIP format, try city name geocoding
        try {
          if (isDebugEnabled) {
            console.log('[ZIP] Attempting city name geocoding for:', trimmedQuery)
          }
          const suggestResponse = await fetch(`/api/geocoding/suggest?q=${encodeURIComponent(trimmedQuery)}&limit=1`)
          const suggestData = await suggestResponse.json()
          
          if (suggestData?.ok && suggestData.data && suggestData.data.length > 0) {
            const firstResult = suggestData.data[0]
            if (firstResult.lat && firstResult.lng) {
              if (isDebugEnabled) {
                console.log('[ZIP] City name geocoding success from URL:', { 
                  query: trimmedQuery, 
                  lat: firstResult.lat, 
                  lng: firstResult.lng,
                  city: firstResult.address?.city,
                  state: firstResult.address?.state
                })
              }
              
              handleZipLocationFound(
                firstResult.lat, 
                firstResult.lng, 
                firstResult.address?.city || firstResult.address?.town || firstResult.address?.village,
                firstResult.address?.state,
                firstResult.address?.postcode || firstResult.address?.zip
              )
              setHasRestoredZip(true)
              return
            }
          }
          
          // Both lookups failed
          if (isDebugEnabled) {
            console.warn('[ZIP] City name geocoding failed from URL:', trimmedQuery)
          }
          handleZipError('Location not found')
        } catch (error) {
          console.error('[ZIP] City name geocoding error from URL:', trimmedQuery, error)
          handleZipError('Failed to lookup location')
        }
        
        setHasRestoredZip(true)
      }
      
      performLocationLookup()
    } else if (!zipFromUrl) {
      // No ZIP in URL, mark as processed
      setHasRestoredZip(true)
    } else {
      // ZIP in URL but already resolved server-side, mark as processed
      setHasRestoredZip(true)
    }
  }, [searchParams, hasRestoredZip, urlLat, urlLng, initialCenter, handleZipLocationFound, handleZipError])

  // visibleSales is already computed above from fetchedSales filtered by viewport
  // This is the sales list that matches what's visible on the map
  // Deduplicate for the list display
  const visibleSalesDeduplicated = useMemo(() => {
    return deduplicateSales(visibleSales)
  }, [visibleSales, deduplicateSales])
  
  // Log visible sales count for debugging
  useEffect(() => {
    if (isDebugEnabled) {
      console.log('[SALES] Visible sales count:', { 
        fetchedSales: fetchedSales.length, 
        visibleSales: visibleSales.length,
        visibleSalesDeduplicated: visibleSalesDeduplicated.length,
        selectedPinId,
        hybridType: hybridResult?.type,
        locationsCount: hybridResult?.locations.length || 0
      })
    }
  }, [fetchedSales.length, visibleSales.length, visibleSalesDeduplicated.length, selectedPinId, hybridResult])

  // Memoized map center

  const mapCenter = useMemo(() => {
    return mapView?.center || { lat: 39.8283, lng: -98.5795 }
  }, [mapView?.center])

  const mapZoom = mapView?.zoom || 10

  // Mobile drawer toggle - no longer needed, sales list always visible on mobile
  // Keeping state for potential future use but not using it currently
  const _toggleMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(prev => !prev)
  }, [])

  // Constants for layout calculations
  const HEADER_HEIGHT = 64 // px - header height (h-16)
  const FILTERS_HEIGHT = 56 // px - filters bar height
  const MAIN_CONTENT_HEIGHT = `calc(100vh - ${HEADER_HEIGHT + FILTERS_HEIGHT}px)`

  // Use mobile filter context
  const { isOpen: isMobileFilterSheetOpen, closeFilterSheet } = useMobileFilter()
  
  // Mobile filter button handler (no longer needed - handled by context)
  const handleMobileFilterClick = useCallback(() => {
    // Handled by context
  }, [])

  // Ref for sales list content container (for potential scroll management)
  const salesListContentRef = useRef<HTMLDivElement>(null)

  // Desktop callout card state
  const desktopMapRef = useRef<any>(null)
  
  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: COMMON_SHORTCUTS.FOCUS_SEARCH,
      handler: () => {
        // Focus ZIP input if it exists - check both container with data-testid and direct input
        const zipInput = document.querySelector<HTMLInputElement>('[data-testid="zip-input"] input, [data-testid="zip-input-mobile"] input, input[placeholder*="ZIP"], input[placeholder*="zip"]')
        if (zipInput) {
          zipInput.focus()
        }
      },
      description: 'Focus search input'
    },
    {
      key: COMMON_SHORTCUTS.OPEN_FILTERS,
      handler: () => {
        if (isMobile) {
          // On mobile, open filter sheet via context
          // The context should handle this, but we can trigger it via the filter button
          const filterButton = document.querySelector<HTMLButtonElement>('[data-testid="filters-more"]')
          if (filterButton) {
            filterButton.click()
          }
        }
        // On desktop, filters are always visible in the bar
      },
      description: 'Open filters'
    }
  ], !isMobile) // Only enable on desktop
  const [desktopPinPosition, setDesktopPinPosition] = useState<{ x: number; y: number } | null>(null)

  // Calculate selected sale for desktop callout
  // Search in fetchedSales (not just visibleSales) in case selected pin is outside current viewport
  const selectedSale = useMemo(() => {
    if (!selectedPinId) return null
    const saleById = fetchedSales.find(sale => sale.id === selectedPinId)
    if (saleById) return saleById
    if (hybridResult?.locations) {
      const location = hybridResult.locations.find(loc => loc.id === selectedPinId)
      if (location && location.sales.length > 0) {
        return location.sales[0]
      }
    }
    return null
  }, [selectedPinId, fetchedSales, hybridResult])

  // Calculate selected pin coordinates for desktop callout
  const selectedPinCoords = useMemo(() => {
    if (!selectedPinId || !hybridResult) return null
    const location = hybridResult.locations.find(loc => loc.id === selectedPinId)
    if (location) {
      return { lat: location.lat, lng: location.lng }
    }
    const sale = fetchedSales.find(sale => sale.id === selectedPinId)
    if (sale && typeof sale.lat === 'number' && typeof sale.lng === 'number') {
      return { lat: sale.lat, lng: sale.lng }
    }
    return null
  }, [selectedPinId, hybridResult, fetchedSales])

  // Convert selected pin coordinates to screen position for desktop callout
  useEffect(() => {
    if (!selectedPinCoords || !desktopMapRef.current) {
      setDesktopPinPosition(null)
      return
    }
    
    // Wait a bit for map to be ready, then calculate position
    const calculatePosition = () => {
      const map = desktopMapRef.current?.getMap?.()
      if (!map || typeof map.project !== 'function') {
        if (isDebugEnabled) {
          console.log('[DESKTOP_CALLOUT] Map not ready:', { hasRef: !!desktopMapRef.current, hasGetMap: !!desktopMapRef.current?.getMap, hasProject: typeof map?.project === 'function' })
        }
        return false
      }
      
      try {
        const point = map.project([selectedPinCoords.lng, selectedPinCoords.lat])
        if (isDebugEnabled) {
          console.log('[DESKTOP_CALLOUT] Calculated pin position:', { x: point.x, y: point.y, coords: selectedPinCoords })
        }
        setDesktopPinPosition({ x: point.x, y: point.y })
        return true
      } catch (error) {
        if (isDebugEnabled) {
          console.error('[DESKTOP_CALLOUT] Error calculating position:', error)
        }
        return false
      }
    }
    
    // Try immediately
    if (calculatePosition()) {
      return
    }
    
    // If map not ready, try again after a short delay
    const timeoutId = setTimeout(() => {
      calculatePosition()
    }, 100)
    
    return () => clearTimeout(timeoutId)
  }, [selectedPinCoords, mapView, currentViewport])

  // Update pin position when map moves or zooms (desktop)
  useEffect(() => {
    if (!selectedPinCoords || !desktopMapRef.current) {
      return
    }
    
    const map = desktopMapRef.current.getMap?.()
    if (!map) return

    const updatePosition = () => {
      try {
        const point = map.project([selectedPinCoords.lng, selectedPinCoords.lat])
        setDesktopPinPosition({ x: point.x, y: point.y })
      } catch (error) {
        // Ignore errors during map transitions
      }
    }

    map.on('move', updatePosition)
    map.on('zoom', updatePosition)

    return () => {
      map.off('move', updatePosition)
      map.off('zoom', updatePosition)
    }
  }, [selectedPinCoords])

  // Handle map click to dismiss callout (desktop)
  const handleDesktopMapClick = useCallback((e: React.MouseEvent) => {
    // Only dismiss if clicking directly on the map container, not on child elements
    if (e.target === e.currentTarget && selectedPinId) {
      setSelectedPinId(null)
    }
  }, [selectedPinId])

  // Handle centering start - track that we're programmatically centering to a pin
  const handleCenteringStart = useCallback((locationId: string, lat: number, lng: number) => {
    isCenteringToPinRef.current = { locationId, lat, lng }
  }, [])

  // Handle centering end - clear the centering flag
  const handleCenteringEnd = useCallback(() => {
    isCenteringToPinRef.current = null
  }, [])

  // Handle viewport change (desktop) - handleViewportChange already dismisses callout
  const handleDesktopViewportChange = useCallback((args: { 
    center: { lat: number; lng: number }; 
    zoom: number; 
    bounds: { west: number; south: number; east: number; north: number } 
  }) => {
    handleViewportChange(args)
  }, [handleViewportChange])

  // Handle "Use my location" button click (desktop)
  // User-initiated: Recenter immediately with best available location, then fire GPS in background
  const handleUseMyLocation = useCallback((lat: number, lng: number, source: 'gps' | 'ip') => {
    if (isDebugEnabled) {
      console.log('[USE_MY_LOCATION] Desktop: User-initiated recenter to:', { lat, lng, source })
    }

    // Get map instance from desktop ref
    const map = desktopMapRef.current?.getMap?.()
    if (!map) {
      if (isDebugEnabled) {
        console.warn('[USE_MY_LOCATION] Desktop: Map not ready')
      }
      return
    }

    // Store location and update permission state
    setLastUserLocation({ lat, lng, source, timestamp: Date.now() })
    if (source === 'gps') {
      setHasLocationPermission(true)
    } else {
      checkGeolocationPermission().then(setHasLocationPermission).catch(() => setHasLocationPermission(false))
    }

    // Persist user-initiated location to cookie (high-confidence source)
    writeLocationCookie(lat, lng, 'user')

    // Recenter map
    forceRecenterToLocation(map, lat, lng, 'user')
    
    // Force visibility recomputation even if map doesn't move
    setMapView(prev => prev ? { ...prev } : null)
  }, [forceRecenterToLocation, lastUserLocation, setLastUserLocation, setHasLocationPermission, setMapView, writeLocationCookie])

  // Handle user-initiated GPS request from mobile (bypasses authority guard)
  // User-initiated: Recenter immediately with best available location, then fire GPS in background
  // This callback receives the map instance from MobileSalesShell
  const handleUserLocationRequest = useCallback((location: { lat: number; lng: number }, mapInstance?: any, source: 'gps' | 'ip' = 'gps') => {
    try {
      if (isDebugEnabled) {
        console.log('[USE_MY_LOCATION] Mobile: User-initiated recenter to:', location, 'hasMap:', !!mapInstance, 'source:', source)
      }

      if (!mapInstance) {
        // Fallback: use reactive path (should not happen, but handle gracefully)
        if (isDebugEnabled) {
          console.warn('[USE_MY_LOCATION] Mobile: No map instance provided, using fallback')
        }
        setLastUserLocation({ lat: location.lat, lng: location.lng, source, timestamp: Date.now() })
        if (source === 'gps') {
          setHasLocationPermission(true)
        } else {
          checkGeolocationPermission().then(setHasLocationPermission).catch(() => setHasLocationPermission(false))
        }
        
        // Persist user-initiated location to cookie (high-confidence source)
        writeLocationCookie(location.lat, location.lng, 'user')
        
        flipToUserAuthority()
        recenterToUserLocation(location, 'user')
        setMapView(prev => prev ? { ...prev } : null)
        return
      }

      // Store location and update permission state
      setLastUserLocation({ lat: location.lat, lng: location.lng, source, timestamp: Date.now() })
      if (source === 'gps') {
        setHasLocationPermission(true)
      } else {
        checkGeolocationPermission().then(setHasLocationPermission).catch(() => setHasLocationPermission(false))
      }

      // Persist user-initiated location to cookie (high-confidence source)
      writeLocationCookie(location.lat, location.lng, 'user')

      // Recenter map
      forceRecenterToLocation(mapInstance, location.lat, location.lng, 'user')
      
      // Force visibility recomputation - onMoveEnd will update mapView naturally
      // We trigger a minimal state update to force shouldShowLocationIcon recomputation
      // This happens after the imperative move, so it won't cause double recenter
    } catch (error) {
      if (isDebugEnabled) {
        console.error('[USE_MY_LOCATION] Mobile: Error in handleUserLocationRequest:', error)
      }
      throw error // Re-throw to be caught by mobile component
    }
  }, [forceRecenterToLocation, lastUserLocation, setLastUserLocation, setHasLocationPermission, setMapView, flipToUserAuthority, recenterToUserLocation, writeLocationCookie])

  return (
    <>
      {/* Mobile Layout - Only on small screens (<768px) */}
      {isMobile ? (
        <MobileSalesShell
          mapView={mapView}
          pendingBounds={pendingBounds}
          mapSales={visibleSales}
          selectedPinId={selectedPinId}
          onViewportMove={handleViewportMove}
          onViewportChange={handleViewportChange}
          onCenteringStart={handleCenteringStart}
          onCenteringEnd={handleCenteringEnd}
          onLocationClick={(locationId) => {
            if (isDebugEnabled) {
              console.log('[SALES] Location clicked:', locationId)
            }
            setSelectedPinId(selectedPinId === locationId ? null : locationId)
          }}
          onClusterClick={({ lat, lng, expandToZoom }) => {
            if (isDebugEnabled) {
              console.log('[CLUSTER] expand', { lat, lng, expandToZoom })
            }
          }}
          currentViewport={currentViewport}
          visibleSales={visibleSales}
          loading={loading}
          isFetching={isFetching}
          hasCompletedInitialLoad={hasCompletedInitialLoad}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClearFilters={clearFilters}
          onZipLocationFound={handleZipLocationFound}
          onZipError={handleZipError}
          zipError={zipError}
          hasActiveFilters={filters.dateRange !== 'any' || filters.categories.length > 0}
          hybridResult={hybridResult}
          userLocation={effectiveCenter || null}
          onUserLocationRequest={handleUserLocationRequest}
          shouldShowLocationIcon={shouldShowLocationIcon}
        />
      ) : (
        /* Desktop Layout - md and above */
        <div className="flex flex-col overflow-hidden" style={{ height: `calc(100vh - ${HEADER_HEIGHT}px)` }}>
          {/* Advanced Filters Bar */}
          <FiltersBar
            onZipLocationFound={handleZipLocationFound}
            onZipError={handleZipError}
            zipError={zipError}
            dateRange={filters.dateRange}
            onDateRangeChange={(dateRange: DateRangeType) => handleFiltersChange({ ...filters, dateRange })}
            categories={filters.categories}
            onCategoriesChange={(categories) => handleFiltersChange({ ...filters, categories })}
            distance={filters.distance}
            onDistanceChange={(distance) => handleFiltersChange({ ...filters, distance })}
            hasActiveFilters={filters.dateRange !== 'any' || filters.categories.length > 0}
            isLoading={loading}
            onClearFilters={clearFilters}
            zipInputTestId="zip-input"
            filtersCenterTestId="filters-center"
            filtersMoreTestId="filters-more"
            onMobileFilterClick={handleMobileFilterClick}
          />

          {/* Main Content - Desktop Layout */}
          <div 
            className="flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:grid-cols-[minmax(0,1fr)_minmax(380px,480px)] xl:grid-cols-[minmax(0,1fr)_minmax(420px,540px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(480px,600px)] gap-0 min-h-0 min-w-0 overflow-hidden flex-1"
            style={{ height: MAIN_CONTENT_HEIGHT }}
          >
            {/* Map - Left on desktop */}
            <div 
              className="relative md:h-full md:min-h-0 bg-gray-100 flex-shrink-0" 
              style={{ height: '100%' }}
              role="region"
              aria-label="Interactive map showing yard sales locations"
              onClick={handleDesktopMapClick}
            >
              {/* Desktop "Use my location" button */}
              {shouldShowLocationIcon && (
                <div className="absolute top-4 right-4 z-10">
                  <UseMyLocationButton
                    onLocationFound={handleUseMyLocation}
                    onError={(error) => {
                      if (isDebugEnabled) {
                        console.log('[USE_MY_LOCATION] Error:', error)
                      }
                    }}
                    hasLocationPermission={hasLocationPermission}
                  />
                </div>
              )}
              <div className="w-full h-full">
                {mapView ? (
                  <SimpleMap
                    ref={desktopMapRef}
                    center={mapCenter}
                    zoom={pendingBounds ? undefined : mapZoom}
                    fitBounds={pendingBounds}
                    fitBoundsOptions={pendingBounds ? { 
                      padding: 0, // No padding to show exact bounds
                      duration: 300, // Smooth transition
                      maxZoom: 15 // Prevent over-zooming
                    } : undefined}
                    hybridPins={{
                      sales: visibleSales,
                      selectedId: selectedPinId,
                      onLocationClick: (locationId) => {
                        if (isDebugEnabled) {
                          console.log('[SALES] Location clicked:', locationId)
                        }
                        // Track Clarity event for pin click
                        trackPinClicked(locationId)
                        setSelectedPinId(selectedPinId === locationId ? null : locationId)
                      },
                      onClusterClick: ({ lat, lng, expandToZoom }) => {
                        if (isDebugEnabled) {
                          console.log('[CLUSTER] expand', { lat, lng, expandToZoom })
                        }
                      },
                      viewport: currentViewport!
                    }}
                    onViewportMove={handleViewportMove}
                    onViewportChange={handleDesktopViewportChange}
                    onCenteringStart={handleCenteringStart}
                    onCenteringEnd={handleCenteringEnd}
                    onMapClick={() => {
                      if (selectedPinId) {
                        setSelectedPinId(null)
                      }
                    }}
                    attributionPosition="bottom-right"
                    showOSMAttribution={true}
                    attributionControl={false}
                  />
                ) : null}
              </div>
              
              
              {/* Desktop callout card */}
              {selectedSale && desktopPinPosition && (
                <MobileSaleCallout
                  sale={selectedSale}
                  onDismiss={() => {
                    if (isDebugEnabled) {
                      console.log('[DESKTOP_CALLOUT] Dismissing callout')
                    }
                    setSelectedPinId(null)
                  }}
                  viewport={mapView ? { center: mapView.center, zoom: mapView.zoom } : null}
                  pinPosition={desktopPinPosition}
                />
              )}
              {process.env.NEXT_PUBLIC_DEBUG === 'true' && selectedPinId && (
                <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white text-xs p-2 z-50 rounded">
                  Debug: selectedPinId={selectedPinId}, selectedSale={selectedSale ? 'yes' : 'no'}, pinPosition={desktopPinPosition ? `x:${desktopPinPosition.x},y:${desktopPinPosition.y}` : 'null'}
                </div>
              )}
            </div>

            {/* Sales List - Right panel on desktop */}
            <div className="hidden md:flex bg-white border-l border-gray-200 flex-col min-h-0 h-full w-full overflow-hidden">
              <div className="flex-shrink-0 px-4 pt-4 pb-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    Sales ({visibleSalesDeduplicated.length})
                  </h2>
                  {isFetching && !loading && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-300 border-t-gray-600"></div>
                      <span>Updating...</span>
                    </div>
                  )}
                </div>
              </div>

              <div 
                ref={salesListContentRef}
                className="flex-1 pl-4 pr-4 pb-4 pt-4 overflow-y-auto"
              >
                {loading && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <SaleCardSkeleton key={i} />
                    ))}
                  </div>
                )}
                  
                {!loading && hasCompletedInitialLoad && visibleSalesDeduplicated.length === 0 && (
                  <EmptyState
                    title="No sales found in this area"
                    suggestions={[
                      ...(filters.distance < 10 ? ['Try increasing your distance filter'] : []),
                      ...(mapView && mapView.zoom > 12 ? ['Try zooming out to see more sales'] : []),
                      ...(filters.dateRange !== 'any' ? ['Try widening your date range'] : []),
                      ...(filters.categories.length > 0 ? ['Try clearing category filters'] : []),
                      ...(filters.dateRange !== 'any' || filters.categories.length > 0 || filters.distance !== 25 ? ['Try clearing all filters'] : []),
                      ...(mapView && mapView.zoom <= 12 && filters.distance >= 10 ? ['Try panning to a different area'] : [])
                    ]}
                  />
                )}

                {!loading && visibleSalesDeduplicated.length > 0 && (
                  <SalesList sales={visibleSalesDeduplicated} _mode="grid" viewport={{ center: mapView?.center || { lat: 39.8283, lng: -98.5795 }, zoom: mapView?.zoom || 10 }} isLoading={loading} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Filter Sheet */}
      <MobileFilterSheet
        isOpen={isMobileFilterSheetOpen}
        onClose={closeFilterSheet}
        dateRange={filters.dateRange}
        onDateRangeChange={(dateRange: DateRangeType) => handleFiltersChange({ ...filters, dateRange })}
        categories={filters.categories}
        onCategoriesChange={(categories) => handleFiltersChange({ ...filters, categories })}
        distance={filters.distance}
        onDistanceChange={(distance) => handleFiltersChange({ ...filters, distance })}
        hasActiveFilters={filters.dateRange !== 'any' || filters.categories.length > 0}
        isLoading={loading}
        onClearFilters={clearFilters}
      />
    </>
  )
}