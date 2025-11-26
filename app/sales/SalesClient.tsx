'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import SimpleMap from '@/components/location/SimpleMap'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import SalesList from '@/components/SalesList'
import FiltersBar from '@/components/sales/FiltersBar'
import MobileFilterSheet from '@/components/sales/MobileFilterSheet'
import MobileSalesShell from './MobileSalesShell'
import MobileSaleCallout from '@/components/sales/MobileSaleCallout'
import { useFilters, type DateRangeType } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'
import { createHybridPins } from '@/lib/pins/hybridClustering'
import { useMobileFilter } from '@/contexts/MobileFilterContext'
import { trackFiltersUpdated, trackPinClicked } from '@/lib/analytics/clarityEvents'
import { 
  expandBounds, 
  isViewportInsideBounds, 
  filterSalesForViewport,
  type Bounds,
  MAP_BUFFER_FACTOR,
  MAP_BUFFER_SAFETY_FACTOR
} from '@/lib/map/bounds'

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
  const { filters, updateFilters, clearFilters, hasActiveFilters: _hasActiveFilters } = useFilters(
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

  // Map view state - single source of truth
  // If ZIP needs resolution, wait before initializing map view to avoid showing wrong location
  // Otherwise, use effectiveCenter which should have been resolved server-side
  const [mapView, setMapView] = useState<MapViewState | null>(() => {
    if (zipNeedsResolution) {
      // ZIP needs client-side resolution - don't show map yet
      return null
    }
    
    // Calculate initial zoom from default distance filter (10 miles = zoom 12)
    // Or use URL zoom if provided, or fallback to 12
    const defaultDistance = 10 // matches DEFAULT_FILTERS.distance in useFilters
    const calculatedZoom = urlZoom ? parseFloat(urlZoom) : distanceToZoom(defaultDistance)
    
    // Calculate bounds based on zoom level (approximate)
    // For zoom 12 (10 miles), use approximately 0.11 degree range (roughly 10 miles at mid-latitudes)
    const zoomLevel = calculatedZoom
    const latRange = zoomLevel === 12 ? 0.11 : zoomLevel === 10 ? 0.45 : zoomLevel === 11 ? 0.22 : 1.0
    const lngRange = latRange * (effectiveCenter?.lat ? Math.cos(effectiveCenter.lat * Math.PI / 180) : 1)
    
    // ZIP already resolved server-side or no ZIP - show map with correct location
    return {
      center: effectiveCenter || { lat: 39.8283, lng: -98.5795 },
      bounds: { 
        west: (effectiveCenter?.lng || -98.5795) - lngRange / 2, 
        south: (effectiveCenter?.lat || 39.8283) - latRange / 2, 
        east: (effectiveCenter?.lng || -98.5795) + lngRange / 2, 
        north: (effectiveCenter?.lat || 39.8283) + latRange / 2
      },
      zoom: calculatedZoom
    }
  })

  // Sales data state - map is source of truth
  // fetchedSales: All sales for the buffered area (larger than viewport)
  // visibleSales: Subset of fetchedSales that intersect current viewport (computed via useMemo)
  const [fetchedSales, setFetchedSales] = useState<Sale[]>(initialSales)
  const [bufferedBounds, setBufferedBounds] = useState<Bounds | null>(null)
  const [loading, setLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false) // Track if a fetch is in progress
  
  // Track deleted sale IDs to filter them out immediately
  const deletedSaleIdsRef = useRef<Set<string>>(new Set())
  const [zipError, setZipError] = useState<string | null>(null)
  const [, setMapMarkers] = useState<{id: string; title: string; lat: number; lng: number}[]>([])
  const [pendingBounds, setPendingBounds] = useState<{ west: number; south: number; east: number; north: number } | null>(null)
  const [_isZipSearching, setIsZipSearching] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [_isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  
  // Track window width for mobile detection
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  
  // Listen for sales:mutated events to filter out deleted sales
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
      }
    }
    
    window.addEventListener('sales:mutated', handleSalesMutated as EventListener)
    return () => {
      window.removeEventListener('sales:mutated', handleSalesMutated as EventListener)
    }
  }, [])
  
  // Filter out deleted sales from any fetched data
  const filterDeletedSales = useCallback((sales: Sale[]) => {
    return sales.filter((sale) => !deletedSaleIdsRef.current.has(sale.id))
  }, [])
  
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
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[BUFFER] Initialized bufferedBounds from initial sales:', initialBufferedBounds)
      }
    }
  }, [initialSales.length, mapView?.bounds, bufferedBounds])
  
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

  // Compute viewport bounds object for buffer utilities
  const viewportBounds = useMemo((): Bounds | null => {
    if (!mapView?.bounds) return null
    return {
      west: mapView.bounds.west,
      south: mapView.bounds.south,
      east: mapView.bounds.east,
      north: mapView.bounds.north
    }
  }, [mapView?.bounds])

  // Derive visibleSales from fetchedSales filtered by current viewport
  // This is the key to smooth panning - we filter locally without refetching
  const visibleSales = useMemo(() => {
    if (!viewportBounds || fetchedSales.length === 0) {
      return []
    }
    return filterSalesForViewport(fetchedSales, viewportBounds)
  }, [fetchedSales, viewportBounds])

  // Hybrid system: Create location groups and apply clustering
  const hybridResult = useMemo(() => {
    // Early return for empty sales - no need to run clustering
    if (!currentViewport || visibleSales.length === 0) {
      return {
        type: 'individual' as const,
        pins: [],
        locations: [],
        clusters: []
      }
    }
    
    // Do not hide pins during fetch; always render using last-known fetchedSales
    
    // Allow clustering regardless of small dataset size to prevent initial pin gaps
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[HYBRID] Clustering', visibleSales.length, 'visible sales out of', fetchedSales.length, 'total fetched')
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
        totalFetchedCount: fetchedSales.length
      })
    }
    
    return result
  }, [visibleSales, currentViewport, fetchedSales.length])

  // Request cancellation for preventing race conditions
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Track API calls for debugging single fetch path
  const apiCallCounterRef = useRef(0)

  // Fetch sales based on buffered bounds (not tight viewport)
  // This function now receives bufferedBounds, which are larger than the viewport
  const fetchMapSales = useCallback(async (bufferedBbox: Bounds, customFilters?: any) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController()
    
    // Increment API call counter for debugging
    apiCallCounterRef.current += 1
    const callId = apiCallCounterRef.current
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[FETCH] fetchMapSales called with buffered bbox:', bufferedBbox)
      console.log('[FETCH] API Call #' + callId + ' - Buffered fetch')
      console.log('[FETCH] Buffered bbox range:', {
        latRange: bufferedBbox.north - bufferedBbox.south,
        lngRange: bufferedBbox.east - bufferedBbox.west,
        center: {
          lat: (bufferedBbox.north + bufferedBbox.south) / 2,
          lng: (bufferedBbox.east + bufferedBbox.west) / 2
        }
      })
    }
    
    // Set fetching state but keep old data visible
    setIsFetching(true)
    // Only set loading=true on initial load (when fetchedSales is empty)
    if (fetchedSales.length === 0) {
      setLoading(true)
    }

    try {
      const params = new URLSearchParams()
      params.set('north', bufferedBbox.north.toString())
      params.set('south', bufferedBbox.south.toString())
      params.set('east', bufferedBbox.east.toString())
      params.set('west', bufferedBbox.west.toString())
      
      const activeFilters = customFilters || filters
      
      if (activeFilters.dateRange) {
        params.set('dateRange', activeFilters.dateRange)
      }
      if (activeFilters.categories && activeFilters.categories.length > 0) {
        params.set('categories', activeFilters.categories.join(','))
      }
      // Pass distance filter to API (convert miles to km)
      if (activeFilters.distance) {
        const distanceKm = activeFilters.distance * 1.60934 // Convert miles to km
        params.set('radiusKm', distanceKm.toString())
      }
      
      // Request more sales to show all pins in buffered area
      params.set('limit', '200')
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[FETCH] API URL:', `/api/sales?${params.toString()}`)
        console.log('[FETCH] Buffered fetch with bbox:', bufferedBbox)
        console.log('[FETCH] Buffered bbox area (degrees):', {
          latRange: bufferedBbox.north - bufferedBbox.south,
          lngRange: bufferedBbox.east - bufferedBbox.west,
          area: (bufferedBbox.north - bufferedBbox.south) * (bufferedBbox.east - bufferedBbox.west)
        })
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
        
        // Update bufferedBounds to track what area we fetched
        setBufferedBounds(bufferedBbox)
        
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
    }
  }, [filters.dateRange, filters.categories, deduplicateSales, filterDeletedSales, fetchedSales.length])

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
    // Update map view state immediately for live rendering
    // This triggers viewportBounds and visibleSales recomputation via useMemo
    // Do NOT clear selection here - it causes blocking during drag
    setMapView(prev => {
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

  // Handle viewport changes from SimpleMap (onMoveEnd) - includes fetch decision logic
  // Core buffer logic: only fetch when viewport exits buffered area
  const handleViewportChange = useCallback(({ center, zoom, bounds }: { center: { lat: number; lng: number }, zoom: number, bounds: { west: number; south: number; east: number; north: number } }) => {
    const viewportBounds: Bounds = {
      west: bounds.west,
      south: bounds.south,
      east: bounds.east,
      north: bounds.north
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SALES] handleViewportChange called with:', {
        center,
        zoom,
        bounds: viewportBounds,
        boundsRange: {
          latRange: bounds.north - bounds.south,
          lngRange: bounds.east - bounds.west
        },
        bufferedBounds,
        isInsideBuffer: bufferedBounds ? isViewportInsideBounds(viewportBounds, bufferedBounds, MAP_BUFFER_SAFETY_FACTOR) : false
      })
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
        
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[SALES] Viewport inside buffer - using cached data, no fetch')
        }
      }
      
      lastBoundsRef.current = bounds
      initialLoadRef.current = false // Mark initial load as complete
    }, 200)
  }, [bufferedBounds, fetchMapSales, selectedPinId, hybridResult])

  // Handle ZIP search with bbox support
  const handleZipLocationFound = useCallback((lat: number, lng: number, city?: string, state?: string, zip?: string, _bbox?: [number, number, number, number]) => {
    setZipError(null)
    setIsZipSearching(true) // Prevent map view changes from overriding ZIP search
    // Don't show transition overlay - just update map directly
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[ZIP] Updating map center to:', { lat, lng, zip, city, state })
      console.log('[ZIP] Received coordinates:', { lat, lng })
    }
    
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
    // Use expanded bounds for buffer, and pass current filters to ensure distance filter is applied
    const bufferedBounds = expandBounds(calculatedBounds, MAP_BUFFER_FACTOR)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[ZIP] Prefetching sales for ZIP location:', { lat, lng, bounds: calculatedBounds, bufferedBounds })
    }
    fetchMapSales(bufferedBounds, filters).catch(err => {
      console.error('[ZIP] Failed to prefetch sales:', err)
    })
    
    // Initialize or update map center - handle null prev state
    setMapView(prev => {
      // Calculate appropriate zoom from distance (10 miles = zoom 11 per distanceToZoom)
      // But let fitBounds determine the exact zoom to show the 10-mile radius bounds
      const estimatedZoom = distanceToZoom(10) // This returns 12, but fitBounds will adjust
      
      if (!prev) {
        // Create new map view with ZIP location
        // Let fitBounds calculate the exact zoom to show the 10-mile radius
        const newView: MapViewState = {
          center: { lat, lng },
          bounds: calculatedBounds,
          zoom: estimatedZoom // Initial zoom, fitBounds will adjust
        }
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[ZIP] New map view:', newView, 'calculatedBounds:', calculatedBounds)
        }
        
        // Use fitBounds to ensure exactly 10-mile radius is visible
        // Set bounds immediately - map will apply when loaded (no animation)
        setPendingBounds(calculatedBounds)
        // Clear after a longer delay to ensure map has time to apply bounds
        setTimeout(() => {
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[ZIP] Clearing pendingBounds after fitBounds applied')
          }
          setPendingBounds(null)
        }, 1000) // Give map more time to apply bounds before clearing
        
        return newView
      }
      
      // Update existing map view
      const newView: MapViewState = {
        ...prev,
        center: { lat, lng },
        bounds: calculatedBounds,
        zoom: estimatedZoom // Initial zoom, fitBounds will adjust
      }
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[ZIP] Updated map view:', newView, 'calculatedBounds:', calculatedBounds)
      }
      
      // Use fitBounds to ensure exactly 10-mile radius is visible
      // Set bounds - map will apply when ready (no animation)
      setPendingBounds(calculatedBounds)
      // Clear after delay to ensure map applies bounds
      setTimeout(() => {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[ZIP] Clearing pendingBounds after fitBounds applied')
        }
        setPendingBounds(null)
      }, 1000) // Give map more time to apply bounds before clearing
      
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
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
        
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[DISTANCE] Calculating new bounds:', {
            center: mapView.center,
            distanceKm,
            newBounds,
            newZoom
          })
        }
        
        // Update map view with new bounds and zoom
        setMapView(prev => {
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
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[DISTANCE] Synced distance filter with initial zoom:', { zoom: initialZoom, distance: correspondingDistance })
        }
      }
    }
    
    // Mark as synced so this only runs once
    hasSyncedDistanceRef.current = true
  // Only run once on mount when mapView is initialized
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapView])

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
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[ZIP] Restoring from URL:', zipFromUrl)
      }
      
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
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[ZIP] Lookup success from URL:', { zip: trimmedZip, lat: data.lat, lng: data.lng })
            }
            
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

  // visibleSales is already computed above from fetchedSales filtered by viewport
  // This is the sales list that matches what's visible on the map
  // Deduplicate for the list display
  const visibleSalesDeduplicated = useMemo(() => {
    return deduplicateSales(visibleSales)
  }, [visibleSales, deduplicateSales])
  
  // Log visible sales count for debugging
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[DESKTOP_CALLOUT] Map not ready:', { hasRef: !!desktopMapRef.current, hasGetMap: !!desktopMapRef.current?.getMap, hasProject: typeof map?.project === 'function' })
        }
        return false
      }
      
      try {
        const point = map.project([selectedPinCoords.lng, selectedPinCoords.lat])
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[DESKTOP_CALLOUT] Calculated pin position:', { x: point.x, y: point.y, coords: selectedPinCoords })
        }
        setDesktopPinPosition({ x: point.x, y: point.y })
        return true
      } catch (error) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[SALES] Location clicked:', locationId)
            }
            setSelectedPinId(selectedPinId === locationId ? null : locationId)
          }}
          onClusterClick={({ lat, lng, expandToZoom }) => {
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[CLUSTER] expand', { lat, lng, expandToZoom })
            }
          }}
          currentViewport={currentViewport}
          visibleSales={visibleSales}
          loading={loading}
          isFetching={isFetching}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClearFilters={clearFilters}
          onZipLocationFound={handleZipLocationFound}
          onZipError={handleZipError}
          zipError={zipError}
          hasActiveFilters={filters.dateRange !== 'any' || filters.categories.length > 0}
          hybridResult={hybridResult}
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
            className="flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_420px] lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_480px] 2xl:grid-cols-[minmax(0,1fr)_540px] gap-0 min-h-0 min-w-0 overflow-hidden flex-1"
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
                        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                          console.log('[SALES] Location clicked:', locationId)
                        }
                        // Track Clarity event for pin click
                        trackPinClicked(locationId)
                        setSelectedPinId(selectedPinId === locationId ? null : locationId)
                      },
                      onClusterClick: ({ lat, lng, expandToZoom }) => {
                        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
                    attributionPosition="top-right"
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
                    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
                  
                {!loading && visibleSalesDeduplicated.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-gray-500">
                      No sales found in this area
                    </div>
                  </div>
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