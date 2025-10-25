'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import SimpleMap from '@/components/location/SimpleMap'
import ZipInput from '@/components/location/ZipInput'
import SaleCard from '@/components/SaleCard'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import FiltersModal from '@/components/filters/FiltersModal'
import FilterTrigger from '@/components/filters/FilterTrigger'
import DateWindowLabel from '@/components/filters/DateWindowLabel'
import DegradedBanner from '@/components/DegradedBanner'
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
  user 
}: SalesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { filters, updateFilters, hasActiveFilters } = useFilters(
    initialCenter?.lat && initialCenter?.lng ? { lat: initialCenter.lat, lng: initialCenter.lng } : undefined
  )

  // Check for URL parameters on client side as backup
  const urlLat = searchParams.get('lat')
  const urlLng = searchParams.get('lng')
  const urlZoom = searchParams.get('zoom')
  
  console.log('[SALES_CLIENT] URL params:', { urlLat, urlLng, urlZoom })
  console.log('[SALES_CLIENT] initialCenter:', initialCenter)
  
  // Use URL parameters if available, otherwise use initialCenter
  const effectiveCenter = urlLat && urlLng 
    ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
    : initialCenter
    
  console.log('[SALES_CLIENT] effectiveCenter:', effectiveCenter)

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
  const [dateWindow, setDateWindow] = useState<{ from: string; to: string } | null>(null)
  const [degraded, setDegraded] = useState(false)

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

      console.log('[FETCH] Viewport fetch with bbox:', bbox)

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
        console.log('[FETCH] Applied deduplication:', { input: data.data.length, output: deduplicated.length })
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
    console.log('[MAP] Viewport change:', { center, zoom, bounds })
    
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
    console.log('[SALES] mapCenter memo triggered:', mapView.center)
    return mapView.center
  }, [mapView.center])

  const mapZoom = mapView.zoom

  // Constants for layout calculations
  const HEADER_HEIGHT = 64 // px - header height
  const FILTERS_HEIGHT = 56 // px - filters bar height
  const MAIN_CONTENT_HEIGHT = `calc(100vh - ${HEADER_HEIGHT + FILTERS_HEIGHT}px)`

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <div className="lg:w-3/4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Sales Search</h1>
              {dateWindow && (
                <DateWindowLabel dateWindow={dateWindow} className="mb-4" />
              )}
              {degraded && (
                <DegradedBanner className="mb-4" />
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  {/* ZIP Input */}
                  <div className="flex-1 sm:flex-none">
                    <div className="text-xs text-gray-500 mb-1">Search different area:</div>
                    <ZipInput
                      onLocationFound={handleZipLocationFound}
                      onError={handleZipError}
                      placeholder="Enter ZIP code"
                      className="w-full sm:w-auto"
                    />
                    {zipError && (
                      <p className="text-red-500 text-sm mt-1">{zipError}</p>
                    )}
                  </div>
              
              {/* Location Button removed per server-side auto center */}
              
              {/* Mobile Filter Trigger */}
              <FilterTrigger
                isOpen={showFiltersModal}
                onToggle={() => setShowFiltersModal(!showFiltersModal)}
                activeFiltersCount={hasActiveFilters ? 1 : 0}
                className="md:hidden"
              />
            </div>
          </div>

          {/* Active filter chips - under search controls, above map/list */}
          {(filters.dateRange !== 'any' || filters.categories.length > 0) && (
            <div className="mt-2 overflow-x-auto whitespace-nowrap flex gap-2">
              {filters.dateRange !== 'any' && (
                <button
                  onClick={() => updateFilters({ dateRange: 'any' as any })}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full"
                >
                  {filters.dateRange === 'today' ? 'Today' : filters.dateRange === 'weekend' ? 'This Weekend' : 'Next Weekend'} ×
                </button>
              )}
              {filters.categories.map((c) => (
                <button
                  key={c}
                  onClick={() => updateFilters({ categories: filters.categories.filter(x => x !== c) })}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full"
                >
                  {c} ×
                </button>
              ))}
            </div>
          )}

          {/* Sales Grid */}
          <div className="mb-6">
            {(!filters.lat || !filters.lng) ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📍</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Location unavailable. Enter a ZIP to see nearby sales.
                </h3>
                <p className="text-gray-500 mb-4">We couldn't determine your location automatically.</p>
                <div className="max-w-md mx-auto">
                  <ZipInput
                    onLocationFound={handleZipLocationFound}
                    onError={handleZipError}
                    placeholder="Enter ZIP code"
                    className="w-full"
                  />
                  {zipError && (
                    <p className="text-red-500 text-sm mt-2">{zipError}</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Show spinner only when loading */}
                <div
                  role="status"
                  aria-live="polite"
                  className={`${loading ? 'flex' : 'hidden'} justify-center items-center py-12`}
                >
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <span className="ml-2">Loading sales...</span>
                </div>

                {/* Sales list grid container */}
                <div
                  className={`w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${
                    loading ? 'opacity-75' : 'opacity-100'
                  }`}
                  data-testid="sales-grid"
                >
                  {loading ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <SaleCardSkeleton key={idx} />
                    ))
                  ) : visibleSales.length === 0 ? (
                    <div className="col-span-full text-center py-16">
                      <h3 className="text-xl font-semibold text-gray-800">No sales found nearby</h3>
                      <p className="text-gray-500 mt-2">Try expanding your search radius or changing the date range.</p>
                      <button
                        onClick={() => updateFilters({ distance: Math.min(100, filters.distance + 10) })}
                        className="mt-4 inline-flex items-center px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                      >
                        Increase distance by 10 miles
                      </button>
                    </div>
                  ) : (
                    visibleSales.map((sale) => (
                      <SaleCard key={sale.id} sale={sale} />
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Desktop Filters Sidebar */}
        <div className="hidden lg:block lg:w-1/3">
          <div className="sticky top-4 space-y-6">
            {/* Filters */}
            <FiltersModal 
              isOpen={true} 
              onClose={() => {}} 
              filters={{
                distance: filters.distance,
                dateRange: { type: filters.dateRange as any },
                categories: filters.categories
              }}
              onFiltersChange={(newFilters) => {
                updateFilters({
                  distance: newFilters.distance,
                  dateRange: newFilters.dateRange.type as any,
                  categories: newFilters.categories
                })
              }}
            />
            
            {/* Map */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-xl font-semibold mb-4">
                Map View
                {visibleSales.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-600">
                    ({visibleSales.length} in view)
                  </span>
                )}
              </h2>
              <div className="h-[400px] rounded-lg overflow-hidden relative">
                <SimpleMap
                  center={mapCenter}
                  zoom={mapZoom}
                  fitBounds={pendingBounds}
                  pins={{
                    sales: visibleSales
                      .filter(s => typeof s.lat === 'number' && typeof s.lng === 'number')
                      .map(s => ({ id: s.id, lat: s.lat!, lng: s.lng! })),
                    selectedId: null,
                    onPinClick: (id) => {
                      console.log('[SALES] Pin clicked:', id)
                    },
                    onClusterClick: ({ lat, lng, expandToZoom }) => {
                      console.log('[CLUSTER] expand', { lat, lng, expandToZoom })
                    }
                  }}
                  onViewportChange={handleViewportChange}
                />
              </div>
              
              {/* Location Info */}
              {filters.lat && filters.lng && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Searching within {filters.distance} miles</strong> of your location
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Showing {visibleSales.length} sales
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Filters Modal */}
      <FiltersModal
        isOpen={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
        filters={{
          distance: filters.distance,
          dateRange: { type: filters.dateRange as any },
          categories: filters.categories
        }}
        onFiltersChange={(newFilters) => {
          updateFilters({
            distance: newFilters.distance,
            dateRange: newFilters.dateRange.type as any,
            categories: newFilters.categories
          })
        }}
      />

    </div>
  )
}