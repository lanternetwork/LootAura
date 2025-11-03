'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import SimpleMap from '@/components/location/SimpleMap'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import SalesList from '@/components/SalesList'
import FiltersBar from '@/components/sales/FiltersBar'
import MobileFilterSheet from '@/components/sales/MobileFilterSheet'
import { useFilters, type DateRangeType } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'
import { createHybridPins } from '@/lib/pins/hybridClustering'
import { useMobileFilter } from '@/contexts/MobileFilterContext'

// Simplified map-as-source types
interface MapViewState {
  center: { lat: number; lng: number }
  bounds: { west: number; south: number; east: number; north: number }
  zoom: number
}


interface SalesClientProps {
  initialSales: Sale[]
  initialCenter: { lat: number; lng: number; label?: { zip?: string; city?: string; state?: string } } | null
  user: User | null
}

export default function SalesClient({ 
  initialSales, 
  initialCenter, 
  user: _user 
}: SalesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { filters, updateFilters, hasActiveFilters: _hasActiveFilters } = useFilters(
    initialCenter?.lat && initialCenter?.lng ? { lat: initialCenter.lat, lng: initialCenter.lng } : undefined
  )

  // Check for URL parameters on client side as backup
  const urlLat = searchParams.get('lat')
  const urlLng = searchParams.get('lng')
  const urlZoom = searchParams.get('zoom')
  
  // Use URL parameters if available, otherwise use initialCenter
  const effectiveCenter = urlLat && urlLng 
    ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
    : initialCenter

  // Check if ZIP in URL needs client-side resolution
  const urlZip = searchParams.get('zip')
  const zipNeedsResolution = urlZip && !urlLat && !urlLng && 
    (!initialCenter || !initialCenter.label?.zip || initialCenter.label.zip !== urlZip.trim())
  
  // Map view state - single source of truth
  // If ZIP needs resolution, wait before initializing map view to avoid showing wrong location
  // Otherwise, use effectiveCenter which should have been resolved server-side
  const [mapView, setMapView] = useState<MapViewState | null>(() => {
    if (zipNeedsResolution) {
      // ZIP needs client-side resolution - don't show map yet
      return null
    }
    // ZIP already resolved server-side or no ZIP - show map with correct location
    return {
      center: effectiveCenter || { lat: 39.8283, lng: -98.5795 },
      bounds: { 
        west: (effectiveCenter?.lng || -98.5795) - 1.0, 
        south: (effectiveCenter?.lat || 39.8283) - 1.0, 
        east: (effectiveCenter?.lng || -98.5795) + 1.0, 
        north: (effectiveCenter?.lat || 39.8283) + 1.0 
      },
      zoom: urlZoom ? parseFloat(urlZoom) : 12
    }
  })

  // Sales data state - map is source of truth
  const [mapSales, setMapSales] = useState<Sale[]>(initialSales)
  const [loading, setLoading] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [, setMapMarkers] = useState<{id: string; title: string; lat: number; lng: number}[]>([])
  const [pendingBounds, setPendingBounds] = useState<{ west: number; south: number; east: number; north: number } | null>(null)
  const [_isZipSearching, setIsZipSearching] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [_isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  
  // Bottom sheet state for mobile (<768px only)
  const [bottomSheetState, setBottomSheetState] = useState<'collapsed' | 'mid' | 'expanded'>('mid')
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartY, setDragStartY] = useState(0)
  const [dragStartHeight, setDragStartHeight] = useState<string>('40vh')
  
  // Track window width for mobile detection
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  const isMobile = windowWidth < 768

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
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true' && unique.length !== sales.length) {
      console.log('[DEDUPE] input=', sales.length, 'output=unique=', unique.length, 'keys=[', unique.slice(0, 3).map(s => s.id), '...]')
    }
    
    return unique
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

  // Hybrid system: Create location groups and apply clustering
  const hybridResult = useMemo(() => {
    // Early return for empty sales - no need to run clustering
    if (!currentViewport || mapSales.length === 0) {
      return {
        type: 'individual' as const,
        pins: [],
        locations: [],
        clusters: []
      }
    }
    
    // Do not hide pins during fetch; always render using last-known mapSales
    
    // Allow clustering regardless of small dataset size to prevent initial pin gaps
    
    // Filter sales to only those within the current viewport bounds
    const visibleSales = mapSales.filter(sale => {
      if (typeof sale.lat !== 'number' || typeof sale.lng !== 'number') return false
      
      return sale.lat >= currentViewport.bounds[1] && // south
             sale.lat <= currentViewport.bounds[3] && // north
             sale.lng >= currentViewport.bounds[0] && // west
             sale.lng <= currentViewport.bounds[2]    // east
    })
    
    // Skip clustering if no visible sales
    if (visibleSales.length === 0) {
      return {
        type: 'individual' as const,
        pins: [],
        locations: [],
        clusters: []
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[HYBRID] Clustering', visibleSales.length, 'visible sales out of', mapSales.length, 'total')
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
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[HYBRID] Clustering completed:', {
        type: result.type,
        pinsCount: result.pins.length,
        locationsCount: result.locations.length,
        visibleSalesCount: visibleSales.length,
        totalSalesCount: mapSales.length
      })
    }
    
    return result
  }, [mapSales, currentViewport, loading])

  // Request cancellation for preventing race conditions
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Track API calls for debugging single fetch path
  const apiCallCounterRef = useRef(0)

  // Fetch sales based on map viewport bbox
  const fetchMapSales = useCallback(async (bbox: { west: number; south: number; east: number; north: number }, customFilters?: any) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController()
    
    // Increment API call counter for debugging
    apiCallCounterRef.current += 1
    const callId = apiCallCounterRef.current
    
    console.log('[FETCH] fetchMapSales called with bbox:', bbox)
    console.log('[FETCH] API Call #' + callId + ' - Single fetch path verification')
    console.log('[FETCH] Bbox range:', {
      latRange: bbox.north - bbox.south,
      lngRange: bbox.east - bbox.west,
      center: {
        lat: (bbox.north + bbox.south) / 2,
        lng: (bbox.east + bbox.west) / 2
      }
    })
    
    setLoading(true)

    try {
      const params = new URLSearchParams()
      params.set('north', bbox.north.toString())
      params.set('south', bbox.south.toString())
      params.set('east', bbox.east.toString())
      params.set('west', bbox.west.toString())
      
      const activeFilters = customFilters || filters
      
      if (activeFilters.dateRange) {
        params.set('dateRange', activeFilters.dateRange)
      }
      if (activeFilters.categories && activeFilters.categories.length > 0) {
        params.set('categories', activeFilters.categories.join(','))
      }
      // Distance parameter removed - map zoom controls visible area
      
      // Request more sales to show all pins in viewport
      params.set('limit', '200')
      
      console.log('[FETCH] API URL:', `/api/sales?${params.toString()}`)
      console.log('[FETCH] Viewport fetch with bbox:', bbox)
      console.log('[FETCH] Bbox area (degrees):', {
        latRange: bbox.north - bbox.south,
        lngRange: bbox.east - bbox.west,
        area: (bbox.north - bbox.south) * (bbox.east - bbox.west)
      })

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
      console.log('[FETCH] API Response:', {
        ok: data.ok,
        dataCount: data.data.length,
        center: data.center,
        distanceKm: data.distanceKm,
        degraded: data.degraded,
        totalCount: data.totalCount,
        bbox: bbox
      })
        
        const deduplicated = deduplicateSales(data.data)
        console.log('[FETCH] Sales received:', { 
          raw: data.data.length, 
          deduplicated: deduplicated.length,
          bbox: bbox
        })
        setMapSales(deduplicated)
        setMapMarkers(deduplicated
          .filter(sale => typeof sale.lat === 'number' && typeof sale.lng === 'number')
          .map(sale => ({
            id: sale.id,
            title: sale.title,
            lat: sale.lat!,
            lng: sale.lng!
          })))
      } else {
        console.log('[FETCH] No data in response:', data)
        setMapSales([])
        setMapMarkers([])
      }
    } catch (error) {
      // Don't log errors for aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[FETCH] Request aborted (newer request started)')
        return
      }
      console.error('[FETCH] Map sales error:', error)
    } finally {
      setLoading(false)
    }
  }, [filters.dateRange, filters.categories, deduplicateSales])

  // Debounce timer for viewport changes
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastBoundsRef = useRef<{ west: number; south: number; east: number; north: number } | null>(null)
  const initialLoadRef = useRef(true) // Track if this is the initial load

  // Handle viewport changes from SimpleMap
  const handleViewportChange = useCallback(({ center, zoom, bounds }: { center: { lat: number; lng: number }, zoom: number, bounds: { west: number; south: number; east: number; north: number } }) => {
    
    console.log('[SALES] handleViewportChange called with:', {
      center,
      zoom,
      bounds,
      boundsRange: {
        latRange: bounds.north - bounds.south,
        lngRange: bounds.east - bounds.west
      }
    })
    
    // If a single location is selected and the user moves the map, exit location view
    if (selectedPinId) {
      setSelectedPinId(null)
    }

    // Update map view state
    setMapView(prev => {
      if (!prev) {
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
        ...prev,
        center,
        zoom,
        bounds
      }
    })

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    // Debounce fetch by 300ms to prevent rapid successive calls during zoom
    debounceTimerRef.current = setTimeout(() => {
      // Skip second API call during initial load (map settling)
      if (initialLoadRef.current && lastBoundsRef.current) {
        console.log('[SALES] Skipping second API call during initial load (map settling)')
        initialLoadRef.current = false // Mark initial load as complete
        return
      }
      
      // Always allow fetch on pan/zoom; debounce above prevents spam.
      
      console.log('[SALES] Debounced fetchMapSales called with bounds:', bounds)
      console.log('[SALES] Entry point: VIEWPORT_CHANGE - Single fetch verification')
      lastBoundsRef.current = bounds
      initialLoadRef.current = false // Mark initial load as complete
      fetchMapSales(bounds)
    }, 300)
  }, [fetchMapSales, selectedPinId])

  // Handle ZIP search with bbox support
  const handleZipLocationFound = useCallback((lat: number, lng: number, city?: string, state?: string, zip?: string, _bbox?: [number, number, number, number]) => {
    setZipError(null)
    setIsZipSearching(true) // Prevent map view changes from overriding ZIP search
    // Don't show transition overlay - just update map directly
    
    console.log('[ZIP] Updating map center to:', { lat, lng, zip, city, state })
    console.log('[ZIP] Received coordinates:', { lat, lng })
    
    // Calculate bounds for ZIP location (10 mile radius)
    const radiusKm = 16.09 // 10 miles in kilometers
    const latRange = radiusKm / 111.0
    const lngRange = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180))
    
    // Calculate exact 10-mile radius bounds
    const calculatedBounds = {
      west: lng - lngRange,
      south: lat - latRange,
      east: lng + lngRange,
      north: lat + latRange
    }
    
    // Prefetch sales data for this ZIP location immediately
    // This ensures pins appear as soon as possible
    console.log('[ZIP] Prefetching sales for ZIP location:', { lat, lng, bounds: calculatedBounds })
    fetchMapSales(calculatedBounds).catch(err => {
      console.error('[ZIP] Failed to prefetch sales:', err)
    })
    
    // Initialize or update map center - handle null prev state
    setMapView(prev => {
      if (!prev) {
        // Create new map view with ZIP location
        // Calculate zoom level for 10-mile radius
        // For 10 miles radius (20 miles diameter), zoom 11-12 is appropriate
        // We'll use fitBounds with minimal padding to ensure exact bounds
        const newView: MapViewState = {
          center: { lat, lng },
          bounds: calculatedBounds,
          zoom: 9 // Lower zoom to prevent zoom-in after fitBounds applies
        }
        console.log('[ZIP] New map view:', newView)
        
        // Use fitBounds to ensure exactly 10-mile radius is visible
        // Set bounds immediately - map will apply when loaded (no animation)
        setPendingBounds(calculatedBounds)
        // Clear after a longer delay to ensure map has time to apply bounds
        setTimeout(() => {
          setPendingBounds(null)
        }, 500) // Give map time to apply bounds before clearing
        
        return newView
      }
      
      // Update existing map view
      const newView: MapViewState = {
        ...prev,
        center: { lat, lng },
        bounds: calculatedBounds,
        zoom: 9 // Lower zoom to prevent zoom-in after fitBounds applies
      }
      console.log('[ZIP] New map view:', newView)
      
      // Use fitBounds to ensure exactly 10-mile radius is visible
      // Set bounds - map will apply when ready (no animation)
      setPendingBounds(calculatedBounds)
      // Clear after delay to ensure map applies bounds
      setTimeout(() => {
        setPendingBounds(null)
      }, 500) // Give map time to apply bounds before clearing
      
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

    // Don't clear bounds immediately - let them persist to maintain the exact 10-mile radius
    // Only clear if user manually pans/zooms (handled by handleViewportChange)
    
    // Map will update directly without transition overlay

    // Sales are already prefetched above, viewport change will refetch if needed
    
    // Clear the ZIP search flag after a delay to allow map to settle
    setTimeout(() => {
      setIsZipSearching(false)
    }, 1000)
  }, [searchParams, router, fetchMapSales])

  const handleZipError = useCallback((error: string) => {
    setZipError(error)
  }, [])

  // Distance to zoom level mapping (miles to zoom level)
  const distanceToZoom = (distance: number): number => {
    switch (distance) {
      case 2: return 14  // Very close - high zoom
      case 5: return 12  // Close - medium-high zoom
      case 10: return 10 // Medium - medium zoom
      case 25: return 8  // Far - low zoom
      default: return 10 // Default to medium zoom
    }
  }

  // Handle filter changes
  const handleFiltersChange = (newFilters: any) => {
    // Check if this is a distance change
    if (newFilters.distance && newFilters.distance !== filters.distance) {
      console.log('[DISTANCE] Converting distance to zoom:', { distance: newFilters.distance, zoom: distanceToZoom(newFilters.distance) })
      console.log('[DISTANCE] Entry point: DISTANCE_CHANGE - No direct fetch, viewport change will trigger fetch')
      
      // Update filters for UI state
      updateFilters(newFilters)
      
      // Change map zoom instead of triggering API call
      const newZoom = distanceToZoom(newFilters.distance)
      setMapView(prev => {
        if (!prev) {
          // If mapView is null, create a default view
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
      
      // No direct API call - let viewport change trigger the fetch
      return
    }
    
    // For other filter changes, trigger single fetch with current bounds
    updateFilters(newFilters) // Keep URL update for filter state
    if (mapView?.bounds) {
      console.log('[FILTERS] Triggering single fetch with new filters:', newFilters)
      console.log('[FILTERS] Entry point: FILTER_CHANGE - Single fetch verification')
      setLoading(true) // Show loading state immediately
      fetchMapSales(mapView.bounds, newFilters)
    }
  }

  // Initial fetch will be triggered by map onLoad event with proper bounds

  // Restore ZIP from URL on page load only (not on every URL change)
  // Skip if initialCenter already matches ZIP (server-side lookup succeeded)
  const [hasRestoredZip, setHasRestoredZip] = useState(false)
  useEffect(() => {
    if (hasRestoredZip) return // Only run once on mount
    
    const zipFromUrl = searchParams.get('zip')
    // Only lookup ZIP client-side if:
    // 1. There's a ZIP in URL
    // 2. No lat/lng in URL
    // 3. InitialCenter doesn't already have the correct ZIP location (server-side lookup might have failed)
    const needsClientSideLookup = zipFromUrl && !urlLat && !urlLng && 
      (!initialCenter || !initialCenter.label?.zip || initialCenter.label.zip !== zipFromUrl.trim())
    
    if (needsClientSideLookup) {
      // Trigger ZIP lookup from URL
      console.log('[ZIP] Restoring from URL:', zipFromUrl)
      
      const performZipLookup = async () => {
        const trimmedZip = zipFromUrl.trim()
        const zipRegex = /^\d{5}(-\d{4})?$/
        
        if (!zipRegex.test(trimmedZip)) {
          console.warn('[ZIP] Invalid ZIP format from URL:', trimmedZip)
          setHasRestoredZip(true)
          return
        }
        
        try {
          const response = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(trimmedZip)}`)
          const data = await response.json()
          
          if (data.ok && data.lat && data.lng) {
            console.log('[ZIP] Lookup success from URL:', { zip: trimmedZip, lat: data.lat, lng: data.lng })
            
            // Use the same handler as manual ZIP input
            const bbox = data.bbox ? [data.bbox[0], data.bbox[1], data.bbox[2], data.bbox[3]] as [number, number, number, number] : undefined
            handleZipLocationFound(data.lat, data.lng, data.city, data.state, data.zip, bbox)
          } else {
            console.warn('[ZIP] Lookup failed from URL:', trimmedZip, data.error)
            handleZipError(data.error || 'ZIP code not found')
          }
        } catch (error) {
          console.error('[ZIP] Lookup error from URL:', trimmedZip, error)
          handleZipError('Failed to lookup ZIP code')
        }
      }
      
      performZipLookup()
      setHasRestoredZip(true) // Mark as restored
    } else if (!zipFromUrl) {
      // No ZIP in URL, mark as processed
      setHasRestoredZip(true)
    } else {
      // ZIP in URL but already resolved server-side, mark as processed
      setHasRestoredZip(true)
    }
  }, [searchParams, hasRestoredZip, urlLat, urlLng, initialCenter, handleZipLocationFound, handleZipError])

  // Memoized visible sales - filtered by current viewport bounds to match map pins
  const visibleSales = useMemo(() => {
    // If a location is selected, show only sales from that location
    if (selectedPinId && hybridResult) {
      const selectedLocation = hybridResult.locations.find((loc: any) => loc.id === selectedPinId)
      if (selectedLocation) {
        console.log('[SALES] Showing sales for selected location:', { 
          locationId: selectedPinId,
          salesCount: selectedLocation.sales.length 
        })
        return selectedLocation.sales
      }
    }
    
    // Filter sales to only those within the current viewport bounds (same as map pins)
    if (!currentViewport) {
      return []
    }
    
    const viewportFilteredSales = mapSales.filter(sale => {
      if (typeof sale.lat !== 'number' || typeof sale.lng !== 'number') return false
      
      return sale.lat >= currentViewport.bounds[1] && // south
             sale.lat <= currentViewport.bounds[3] && // north
             sale.lng >= currentViewport.bounds[0] && // west
             sale.lng <= currentViewport.bounds[2]    // east
    })
    
    const deduplicated = deduplicateSales(viewportFilteredSales)
    
    // Only log when there are sales or when debug is enabled
    if (deduplicated.length > 0 || process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SALES] Visible sales count:', { 
        mapSales: mapSales.length, 
        viewportFiltered: viewportFilteredSales.length,
        visibleSales: deduplicated.length,
        selectedPinId,
        hybridType: hybridResult?.type,
        locationsCount: hybridResult?.locations.length || 0
      })
    }
    
    return deduplicated
  }, [mapSales, currentViewport, deduplicateSales, selectedPinId, hybridResult])

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
  const FILTERS_HEIGHT = 56 // px - filters bar height
  const MAIN_CONTENT_HEIGHT = `calc(100vh - ${FILTERS_HEIGHT}px)`

  // Use mobile filter context
  const { isOpen: isMobileFilterSheetOpen, closeFilterSheet } = useMobileFilter()
  
  // Mobile filter button handler (no longer needed - handled by context)
  const handleMobileFilterClick = useCallback(() => {
    // Handled by context
  }, [])

  // Bottom sheet height calculations
  const getBottomSheetHeight = useCallback((state: 'collapsed' | 'mid' | 'expanded'): string => {
    switch (state) {
      case 'collapsed':
        return '48px'
      case 'mid':
        return '40vh'
      case 'expanded':
        return '75vh'
      default:
        return '40vh'
    }
  }, [])

  // Bottom sheet drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true)
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    setDragStartY(clientY)
    setDragStartHeight(getBottomSheetHeight(bottomSheetState))
  }, [bottomSheetState, getBottomSheetHeight])

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const deltaY = dragStartY - clientY // Positive = dragging up (expanding)
    const windowHeight = window.innerHeight
    
    // Calculate current height based on start height and drag distance
    let currentHeightPx: number
    if (dragStartHeight.includes('vh')) {
      const vhPercent = parseFloat(dragStartHeight) / 100
      currentHeightPx = windowHeight * vhPercent + deltaY
    } else {
      currentHeightPx = parseFloat(dragStartHeight) + deltaY
    }
    
    currentHeightPx = Math.max(48, Math.min(windowHeight * 0.75, currentHeightPx))
    
    // Snap to nearest state based on current height
    const collapsedThreshold = 100
    const _midThreshold = windowHeight * 0.35
    const expandedThreshold = windowHeight * 0.65
    
    if (currentHeightPx < collapsedThreshold) {
      setBottomSheetState('collapsed')
    } else if (currentHeightPx < expandedThreshold) {
      setBottomSheetState('mid')
    } else {
      setBottomSheetState('expanded')
    }
  }, [isDragging, dragStartY, dragStartHeight])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Setup drag listeners
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => handleDragMove(e)
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      handleDragMove(e)
    }
    const handleMouseUp = () => handleDragEnd()
    const handleTouchEnd = () => handleDragEnd()

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchend', handleTouchEnd)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isDragging, handleDragMove, handleDragEnd])

  return (
    <div className="flex flex-col h-screen">

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
        zipInputTestId="zip-input"
        filtersCenterTestId="filters-center"
        filtersMoreTestId="filters-more"
        onMobileFilterClick={handleMobileFilterClick}
      />

      {/* Main Content - Responsive Layout */}
      <div 
        className="flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_628px] lg:grid-cols-[minmax(0,1fr)_628px] xl:grid-cols-[minmax(0,1fr)_628px] gap-0 min-h-0 min-w-0 overflow-hidden flex-1"
        style={{ height: MAIN_CONTENT_HEIGHT }}
      >
        {/* Map - Top on mobile, Left on desktop */}
        <div 
          className="relative md:h-full md:min-h-0 bg-gray-100 flex-shrink-0" 
          style={{ 
            height: isMobile 
              ? `calc(100vh - ${FILTERS_HEIGHT}px)` 
              : '100%' 
          }}
        >
          <div className="w-full h-full">
            {mapView ? (
              <SimpleMap
                center={mapCenter}
                zoom={pendingBounds ? undefined : mapZoom}
                fitBounds={pendingBounds}
                fitBoundsOptions={pendingBounds ? { 
                  padding: 20, 
                  duration: 0 // No animation for ZIP search - instant positioning
                } : undefined}
                hybridPins={{
                  sales: mapSales,
                  selectedId: selectedPinId,
                  onLocationClick: (locationId) => {
                    console.log('[SALES] Location clicked:', locationId)
                    setSelectedPinId(selectedPinId === locationId ? null : locationId)
                  },
                  onClusterClick: ({ lat, lng, expandToZoom }) => {
                    console.log('[CLUSTER] expand', { lat, lng, expandToZoom })
                    // Note: map flyTo is handled in SimpleMap; we just rely on viewport→fetch debounce already in place
                  },
                  viewport: currentViewport!
                }}
                onViewportChange={handleViewportChange}
              />
            ) : null}
          </div>
        </div>

        {/* Sales List - Below map on mobile, Right panel on desktop */}
        <div className="hidden md:flex bg-white border-l border-gray-200 flex-col min-h-0 min-w-0 h-full overflow-y-auto">
          <div className="flex-shrink-0 p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Sales ({visibleSales.length})
                {selectedPinId && (
                  <span className="text-sm text-blue-600 ml-2">
                    (Location selected)
                  </span>
                )}
              </h2>
              {selectedPinId && (
                <button
                  onClick={() => setSelectedPinId(null)}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Show All Sales
                </button>
                  )}
                </div>
                </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SaleCardSkeleton key={i} />
                ))}
                    </div>
                  )}
                  
            {!loading && visibleSales.length === 0 && (
              <div className="text-center py-8">
                <div className="text-gray-500 mb-4">
                  No sales found in this area
                    </div>
                          <button
                  onClick={() => handleFiltersChange({ ...filters, distance: Math.min(25, filters.distance + 5) })}
                  className="px-4 py-2 rounded btn-accent"
                          >
                  Increase Distance
                          </button>
                        </div>
            )}

            {!loading && visibleSales.length > 0 && (
              <SalesList sales={visibleSales} mode="grid" viewport={{ center: mapView?.center || { lat: 39.8283, lng: -98.5795 }, zoom: mapView?.zoom || 10 }} />
            )}
          </div>
          </div>
        </div>

      {/* Mobile Bottom Sheet - Only on mobile (<768px) */}
      {isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 rounded-t-2xl shadow-lg z-30 transition-all duration-300 ease-out"
          style={{
            height: getBottomSheetHeight(bottomSheetState),
          }}
        >
          {/* Drag Handle */}
          <div
            className="flex items-center justify-center h-12 cursor-grab active:cursor-grabbing border-b border-gray-200 select-none"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
          </div>

          {/* Sheet Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Results near you ({visibleSales.length})
              </h2>
              {selectedPinId && (
                <button
                  onClick={() => setSelectedPinId(null)}
                  className="text-sm link-accent underline"
                >
                  Show All
                </button>
              )}
            </div>
          </div>

          {/* Sheet Content */}
          <div 
            className="overflow-y-auto"
            style={{ 
              height: bottomSheetState === 'collapsed' 
                ? '0px' 
                : `calc(${getBottomSheetHeight(bottomSheetState)} - 96px)`,
              overflowY: bottomSheetState === 'collapsed' ? 'hidden' : 'auto'
            }}
          >
            {bottomSheetState !== 'collapsed' && (
              <>
                {loading && (
                  <div className="grid grid-cols-1 gap-3 p-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <SaleCardSkeleton key={i} />
                    ))}
                  </div>
                )}

                {!loading && visibleSales.length === 0 && (
                  <div className="text-center py-8 px-4">
                    <div className="text-gray-500 mb-4">
                      No sales found in this area
                    </div>
                    <button
                      onClick={() => handleFiltersChange({ ...filters, distance: Math.min(25, filters.distance + 5) })}
                      className="px-4 py-2 rounded btn-accent"
                    >
                      Increase Distance
                    </button>
                  </div>
                )}

                {!loading && visibleSales.length > 0 && (
                  <div className="p-4">
                    <SalesList sales={visibleSales} mode="grid" viewport={{ center: mapView?.center || { lat: 39.8283, lng: -98.5795 }, zoom: mapView?.zoom || 10 }} />
                  </div>
                )}
              </>
            )}
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
      />

    </div>
  )
}