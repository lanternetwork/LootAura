'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import SimpleMap from '@/components/location/SimpleMap'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import SalesList from '@/components/SalesList'
import FiltersModal from '@/components/filters/FiltersModal'
import FiltersBar from '@/components/sales/FiltersBar'
import { useFilters } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'
import { createHybridPins } from '@/lib/pins/hybridClustering'

// Simplified map-as-source types
interface MapViewState {
  center: { lat: number; lng: number }
  bounds: { west: number; south: number; east: number; north: number }
  zoom: number
}


interface SalesClientProps {
  initialSales: Sale[]
  initialCenter: { lat: number; lng: number } | null
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

  // Map view state - single source of truth
  const [mapView, setMapView] = useState<MapViewState>({
    center: effectiveCenter || { lat: 39.8283, lng: -98.5795 },
    bounds: { 
      west: (effectiveCenter?.lng || -98.5795) - 1.0, 
      south: (effectiveCenter?.lat || 39.8283) - 1.0, 
      east: (effectiveCenter?.lng || -98.5795) + 1.0, 
      north: (effectiveCenter?.lat || 39.8283) + 1.0 
    },
    zoom: urlZoom ? parseFloat(urlZoom) : 12
  })

  // Sales data state - map is source of truth
  const [mapSales, setMapSales] = useState<Sale[]>(initialSales)
  const [loading, setLoading] = useState(false)
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [, setMapMarkers] = useState<{id: string; title: string; lat: number; lng: number}[]>([])
  const [pendingBounds, setPendingBounds] = useState<{ west: number; south: number; east: number; north: number } | null>(null)
  const [_isZipSearching, setIsZipSearching] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const [isMapTransitioning, setIsMapTransitioning] = useState(false)

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
    if (!mapView.bounds) return null
    
        return {
      bounds: [
        mapView.bounds.west,
        mapView.bounds.south,
        mapView.bounds.east,
        mapView.bounds.north
      ] as [number, number, number, number],
      zoom: mapView.zoom
    }
  }, [mapView.bounds, mapView.zoom])

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
    
    // Skip clustering during initial load to improve performance
    if (loading) {
      return {
        type: 'individual' as const,
        pins: [],
        locations: [],
        clusters: []
      }
    }
    
    // Skip clustering for very small datasets to improve performance
    if (mapSales.length < 3) {
      return {
        type: 'individual' as const,
        pins: [],
        locations: [],
        clusters: []
      }
    }
    
    // Skip expensive clustering for small datasets
    if (mapSales.length < 5) {
      return {
        type: 'individual' as const,
        pins: [],
        locations: [],
        clusters: []
      }
    }
    
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
    
    // Only run clustering on visible sales
    const result = createHybridPins(visibleSales, currentViewport, {
      coordinatePrecision: 5, // Increased to group sales within ~1m radius (more precise)
      clusterRadius: 0.3, // Reduced cluster radius for less aggressive clustering
      minClusterSize: 3, // Increased minimum cluster size
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

  // Fetch sales based on map viewport bbox
  const fetchMapSales = useCallback(async (bbox: { west: number; south: number; east: number; north: number }, customFilters?: any) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController()
    
    console.log('[FETCH] fetchMapSales called with bbox:', bbox)
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
    
    // Update map view state
    setMapView(prev => ({
      ...prev,
      center,
      zoom,
      bounds
    }))

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    // Debounce fetch by 150ms to prevent rapid successive calls during zoom
    debounceTimerRef.current = setTimeout(() => {
      // Check if bounds have changed significantly (more than 5% change)
      const lastBounds = lastBoundsRef.current
      if (lastBounds) {
        const latChange = Math.abs(bounds.north - bounds.south - (lastBounds.north - lastBounds.south)) / (lastBounds.north - lastBounds.south)
        const lngChange = Math.abs(bounds.east - bounds.west - (lastBounds.east - lastBounds.west)) / (lastBounds.east - lastBounds.west)
        
        if (latChange < 0.05 && lngChange < 0.05) {
          console.log('[SALES] Bounds change too small, skipping fetch:', { latChange, lngChange })
          return
        }
      }
      
      console.log('[SALES] Debounced fetchMapSales called with bounds:', bounds)
      lastBoundsRef.current = bounds
      fetchMapSales(bounds)
    }, 300)
  }, [fetchMapSales])

  // Handle ZIP search with bbox support
  const handleZipLocationFound = (lat: number, lng: number, city?: string, state?: string, zip?: string, bbox?: [number, number, number, number]) => {
    setZipError(null)
    setIsZipSearching(true) // Prevent map view changes from overriding ZIP search
    setIsMapTransitioning(true) // Show loading overlay
    
    console.log('[ZIP] Updating map center to:', { lat, lng, zip, city, state })
    console.log('[ZIP] Received coordinates:', { lat, lng, type: typeof lat, type_lng: typeof lng })
    console.log('[ZIP] Actual lat value:', lat)
    console.log('[ZIP] Actual lng value:', lng)
    console.log('[ZIP] Expected ZIP 40204 coordinates: 38.2380249, -85.7246945')
    
    // Update map center
    setMapView(prev => {
      const newView = {
        ...prev,
        center: { lat, lng },
        zoom: 12 // More zoomed in to focus on specific ZIP area
      }
      console.log('[ZIP] New map view:', newView)
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

    // If bbox is available, use fitBounds; otherwise use center/zoom
    if (bbox) {
      setPendingBounds({
        west: bbox[0],
        south: bbox[1], 
        east: bbox[2],
        north: bbox[3]
      })
      // Clear bounds after one use
      setTimeout(() => setPendingBounds(null), 0)
    }
    
    // Hide transition overlay after map has time to load
    setTimeout(() => {
      setIsMapTransitioning(false)
    }, 1500) // Give map time to load new tiles

    // Sales will be fetched automatically when the map viewport updates
    
    // Clear the ZIP search flag after a delay to allow map to settle
    setTimeout(() => {
      setIsZipSearching(false)
    }, 1000)
  }

  const handleZipError = (error: string) => {
    setZipError(error)
  }

  // Distance to zoom level mapping (miles to zoom level)
  const distanceToZoom = (distance: number): number => {
    switch (distance) {
      case 2: return 14  // Very close - high zoom
      case 5: return 12  // Close - medium-high zoom
      case 10: return 10 // Medium - medium zoom
      case 25: return 8  // Far - low zoom
      case 50: return 6  // Very far - very low zoom
      case 100: return 4 // Extremely far - minimum zoom
      default: return 10 // Default to medium zoom
    }
  }

  // Handle filter changes
  const handleFiltersChange = (newFilters: any) => {
    // Check if this is a distance change
    if (newFilters.distance && newFilters.distance !== filters.distance) {
      console.log('[DISTANCE] Converting distance to zoom:', { distance: newFilters.distance, zoom: distanceToZoom(newFilters.distance) })
      
      // Update filters for UI state
      updateFilters(newFilters)
      
      // Change map zoom instead of triggering API call
      const newZoom = distanceToZoom(newFilters.distance)
      setMapView(prev => ({
        ...prev,
        zoom: newZoom
      }))
      
      // No direct API call - let viewport change trigger the fetch
      return
    }
    
    // For other filter changes, trigger refetch with new filters using current bounds
    updateFilters(newFilters) // Keep URL update for filter state
    if (mapView.bounds) {
      console.log('[FILTERS] Triggering refetch with new filters:', newFilters)
      setLoading(true) // Show loading state immediately
      fetchMapSales(mapView.bounds, newFilters)
    }
  }

  // Initial fetch will be triggered by map onLoad event with proper bounds

  // Restore ZIP from URL on page load only (not on every URL change)
  const [hasRestoredZip, setHasRestoredZip] = useState(false)
  useEffect(() => {
    if (hasRestoredZip) return // Only run once on mount
    
    const zipFromUrl = searchParams.get('zip')
    if (zipFromUrl) {
      // Trigger ZIP lookup from URL
      console.log('[ZIP] Restoring from URL:', zipFromUrl)
      // This would need to be implemented with a ZIP lookup service
      // For now, we'll just log it
      setHasRestoredZip(true) // Mark as restored
    }
  }, [searchParams, hasRestoredZip])

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
    return mapView.center
  }, [mapView.center])

  const mapZoom = mapView.zoom

  // Mobile drawer toggle
  const toggleMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(prev => !prev)
  }, [])

  // Constants for layout calculations
  const FILTERS_HEIGHT = 56 // px - filters bar height
  const MAIN_CONTENT_HEIGHT = `calc(100vh - ${FILTERS_HEIGHT}px)`

  return (
    <div className="flex flex-col h-screen">

      {/* Advanced Filters Bar */}
      <FiltersBar
        onZipLocationFound={handleZipLocationFound}
        onZipError={handleZipError}
        zipError={zipError}
        dateRange={filters.dateRange}
        onDateRangeChange={(dateRange) => handleFiltersChange({ ...filters, dateRange })}
        categories={filters.categories}
        onCategoriesChange={(categories) => handleFiltersChange({ ...filters, categories })}
        distance={filters.distance}
        onDistanceChange={(distance) => handleFiltersChange({ ...filters, distance })}
        onAdvancedFiltersOpen={() => setShowFiltersModal(true)}
        hasActiveFilters={filters.dateRange !== 'any' || filters.categories.length > 0}
        zipInputTestId="zip-input"
        filtersCenterTestId="filters-center"
        filtersMoreTestId="filters-more"
      />

      {/* Main Content - Responsive Layout */}
      <div 
        className="grid grid-cols-[minmax(0,1fr)_628px] lg:grid-cols-[minmax(0,1fr)_628px] xl:grid-cols-[minmax(0,1fr)_628px] max-lg:grid-cols-1 gap-0 min-h-0 min-w-0 overflow-hidden"
        style={{ height: MAIN_CONTENT_HEIGHT }}
      >
        {/* Map - Left Side (Dominant) */}
        <div className="relative min-h-0 min-w-0 bg-gray-100 max-lg:h-[60vh] max-md:h-[70vh]" style={{ height: '100%' }}>
          {/* Mobile Toggle Button */}
          <button
            onClick={toggleMobileDrawer}
            className="md:hidden fixed top-20 right-4 z-50 bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg shadow-lg transition-colors"
            aria-label="Toggle sales panel"
          >
            {isMobileDrawerOpen ? 'Hide Sales' : 'Show Sales'}
          </button>
          
          <div className="w-full h-full">
            <SimpleMap
              center={mapCenter}
              zoom={mapZoom}
              fitBounds={pendingBounds}
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
              isTransitioning={isMapTransitioning}
              transitionMessage="Loading new location..."
              />
            </div>
          </div>

        {/* Sales List - Right Panel */}
        <div className="bg-white border-l border-gray-200 flex flex-col min-h-0 min-w-0 max-lg:h-[40vh] max-md:h-[30vh]">
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
                  onClick={() => handleFiltersChange({ ...filters, distance: Math.min(100, filters.distance + 10) })}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                  Increase Distance
                          </button>
                        </div>
            )}

            {!loading && visibleSales.length > 0 && (
              <SalesList sales={visibleSales} mode="grid" />
            )}
          </div>
          </div>
        </div>

      {/* Mobile Sales Drawer */}
      <div className={`
        md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40
        transform transition-transform duration-300 ease-in-out
        ${isMobileDrawerOpen ? 'translate-y-0' : 'translate-y-full'}
      `}>
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
        
        <div className="flex-1 overflow-y-auto p-4 max-h-[50vh]">
          {loading && (
            <div className="grid grid-cols-1 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
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
                onClick={() => handleFiltersChange({ ...filters, distance: Math.min(100, filters.distance + 10) })}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Increase Distance
              </button>
            </div>
          )}

          {!loading && visibleSales.length > 0 && (
            <SalesList sales={visibleSales} mode="grid" />
          )}
        </div>
      </div>

      {/* Filters Modal */}
            <FiltersModal 
        isOpen={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
              filters={{
                distance: filters.distance,
          dateRange: filters.dateRange as any,
                categories: filters.categories
              }}
        onFiltersChange={handleFiltersChange}
      />

    </div>
  )
}