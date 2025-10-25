'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import SimpleMap from '@/components/location/SimpleMap'
import SaleCard from '@/components/SaleCard'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import FiltersModal from '@/components/filters/FiltersModal'
import FiltersBar from '@/components/sales/FiltersBar'
import { useFilters } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'

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
    bounds: { west: -98.5795, south: 39.8283, east: -98.5795, north: 39.8283 },
    zoom: urlZoom ? parseFloat(urlZoom) : 10
  })

  // Sales data state - map is source of truth
  const [mapSales, setMapSales] = useState<Sale[]>(initialSales)
  const [loading, setLoading] = useState(false)
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [, setMapMarkers] = useState<{id: string; title: string; lat: number; lng: number}[]>([])
  const [pendingBounds, setPendingBounds] = useState<{ west: number; south: number; east: number; north: number } | null>(null)
  const [, setIsZipSearching] = useState(false)

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

  // Fetch sales based on map viewport bbox
  const fetchMapSales = useCallback(async (bbox: { west: number; south: number; east: number; north: number }) => {
    setLoading(true)

    try {
      const params = new URLSearchParams()
      params.set('north', bbox.north.toString())
      params.set('south', bbox.south.toString())
      params.set('east', bbox.east.toString())
      params.set('west', bbox.west.toString())
      
      if (filters.dateRange) {
        params.set('dateRange', filters.dateRange)
      }
      if (filters.categories && filters.categories.length > 0) {
        params.set('categories', filters.categories.join(','))
      }

      // Fetch logging reduced for performance
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[FETCH] Viewport fetch with bbox:', bbox)
        console.log('[FETCH] API URL:', `/api/sales?${params.toString()}`)
      }

      const response = await fetch(`/api/sales?${params.toString()}`)
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
        const deduplicated = deduplicateSales(data.data)
        // Deduplication logging reduced for performance
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[FETCH] Applied deduplication:', { input: data.data.length, output: deduplicated.length })
        }
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
      console.error('[FETCH] Map sales error:', error)
    } finally {
      setLoading(false)
    }
  }, [filters.dateRange, filters.categories, deduplicateSales])

  // Debounce timer for viewport changes
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Handle viewport changes from SimpleMap
  const handleViewportChange = useCallback(({ center, zoom, bounds }: { center: { lat: number; lng: number }, zoom: number, bounds: { west: number; south: number; east: number; north: number } }) => {
    
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
    
    // Debounce fetch by 200ms to prevent rapid successive calls
    debounceTimerRef.current = setTimeout(() => {
      fetchMapSales(bounds)
    }, 200)
  }, [fetchMapSales])

  // Handle ZIP search with bbox support
  const handleZipLocationFound = (lat: number, lng: number, city?: string, state?: string, zip?: string, bbox?: [number, number, number, number]) => {
    setZipError(null)
    setIsZipSearching(true) // Prevent map view changes from overriding ZIP search
    
    console.log('[ZIP] Updating map center to:', { lat, lng, zip })
    
    // Update map center
    setMapView(prev => {
      const newView = {
        ...prev,
        center: { lat, lng },
        zoom: 12
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

    // Fetch sales for new location (using center for now, will be updated by viewport change)
    const tempBounds = {
      west: lng - 0.1,
      south: lat - 0.1,
      east: lng + 0.1,
      north: lat + 0.1
    }
    fetchMapSales(tempBounds)
    
    // Clear the ZIP search flag after a delay to allow map to settle
    setTimeout(() => {
      setIsZipSearching(false)
      console.log('[ZIP] Search completed, allowing map view changes')
    }, 1000)
  }

  const handleZipError = (error: string) => {
    setZipError(error)
  }

  // Handle filter changes
  const handleFiltersChange = (newFilters: any) => {
    updateFilters(newFilters)
    // Trigger refetch with new filters using current bounds
    if (mapView.bounds) {
      fetchMapSales(mapView.bounds)
    }
  }

  // Restore ZIP from URL on page load
  useEffect(() => {
    const zipFromUrl = searchParams.get('zip')
    if (zipFromUrl) {
      // Trigger ZIP lookup from URL
      console.log('[ZIP] Restoring from URL:', zipFromUrl)
      // This would need to be implemented with a ZIP lookup service
      // For now, we'll just log it
    }
  }, [searchParams])

  // Memoized visible sales - always derived from mapSales
  const visibleSales = useMemo(() => {
    return deduplicateSales(mapSales)
  }, [mapSales, deduplicateSales])

  // Memoized map center
  const mapCenter = useMemo(() => {
    return mapView.center
  }, [mapView.center])

  const mapZoom = mapView.zoom

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
        onDateRangeChange={(dateRange) => updateFilters({ dateRange })}
        categories={filters.categories}
        onCategoriesChange={(categories) => updateFilters({ categories })}
        distance={filters.distance}
        onDistanceChange={(distance) => updateFilters({ distance })}
        onAdvancedFiltersOpen={() => setShowFiltersModal(true)}
        hasActiveFilters={filters.dateRange !== 'any' || filters.categories.length > 0}
        zipInputTestId="zip-input"
        filtersCenterTestId="filters-center"
        filtersMoreTestId="filters-more"
      />

      {/* Main Content - Zillow Style */}
      <div 
        className="grid grid-cols-[minmax(0,1fr)_420px] gap-0 min-h-0 min-w-0 overflow-hidden"
        style={{ height: MAIN_CONTENT_HEIGHT }}
      >
        {/* Map - Left Side (Dominant) */}
        <div className="relative min-h-0 min-w-0 bg-gray-100" style={{ height: '100%' }}>
          <div className="w-full h-full">
            <SimpleMap
              center={mapCenter}
              zoom={mapZoom}
              fitBounds={pendingBounds}
              pins={{
                sales: visibleSales
                  .filter(s => typeof s.lat === 'number' && typeof s.lng === 'number')
                  .map(s => ({ id: s.id, lat: s.lat!, lng: s.lng! })),
                selectedId: null, // TODO: Add selected sale state if needed
                onPinClick: (id) => {
                  console.log('[SALES] Pin clicked:', id)
                  // You can add sale selection logic here
                },
                onClusterClick: ({ lat, lng, expandToZoom }) => {
                  console.log('[CLUSTER] expand', { lat, lng, expandToZoom })
                  // Note: map flyTo is handled in SimpleMap; we just rely on viewport→fetch debounce already in place
                }
              }}
              onViewportChange={handleViewportChange}
            />
          </div>
        </div>

        {/* Sales List - Right Panel */}
        <div className="bg-white border-l border-gray-200 flex flex-col min-h-0 min-w-0">
          <div className="flex-shrink-0 p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">
              Sales ({visibleSales.length})
            </h2>
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
                  onClick={() => updateFilters({ distance: Math.min(100, filters.distance + 10) })}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Increase Distance
                </button>
              </div>
            )}

            {!loading && visibleSales.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {visibleSales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            )}
          </div>
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