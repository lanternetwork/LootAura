'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import SalesMap from '@/components/location/SalesMap'
import ZipInput from '@/components/location/ZipInput'
import SaleCard from '@/components/SaleCard'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import FiltersModal from '@/components/filters/FiltersModal'
import FilterTrigger from '@/components/filters/FilterTrigger'
import DateWindowLabel from '@/components/filters/DateWindowLabel'
import DegradedBanner from '@/components/DegradedBanner'
import { useFilters } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'
import { milesToKm } from '@/utils/geo'
import LoadMoreButton from '@/components/LoadMoreButton'
import DiagnosticOverlay from '@/components/DiagnosticOverlay'
import { diagnosticFetch, emitSuppressedFetch } from '@/lib/diagnostics/fetchWrapper'
import salesListDebug from '@/lib/debug/salesListDebug'
import { normalizeFilters, filtersEqual, createCategoriesKey } from '@/lib/shared/categoryNormalizer'
import LayoutDiagnostic from '@/components/LayoutDiagnostic'
import GridLayoutDiagnostic from '@/components/GridLayoutDiagnostic'
import GridDebugOverlay from '@/components/GridDebugOverlay'
import { resolveDatePreset } from '@/lib/shared/resolveDatePreset'

// Simplified map-as-source types
interface MapViewState {
  center: { lat: number; lng: number }
  bounds: { west: number; south: number; east: number; north: number }
  zoom: number
}

// Cookie utility functions
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

function setCookie(name: string, value: string, days: number = 1) {
  const expires = new Date()
  expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000))
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`
}

interface SalesClientProps {
  initialSales: Sale[]
  initialSearchParams: {
    lat?: string
    lng?: string
    distanceKm?: string
    city?: string
    dateRange?: string
    categories?: string
  }
  initialCenter: { lat: number; lng: number } | null
  user: User | null
}

export default function SalesClient({ 
  initialSales, 
  initialSearchParams, 
  initialCenter, 
  user 
}: SalesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { filters, updateFilters, hasActiveFilters } = useFilters(
    initialCenter?.lat && initialCenter?.lng ? { lat: initialCenter.lat, lng: initialCenter.lng } : undefined
  )

  // Map view state - single source of truth
  const [mapView, setMapView] = useState<MapViewState>({
    center: initialCenter || { lat: 39.8283, lng: -98.5795 },
    bounds: { west: -98.5795, south: 39.8283, east: -98.5795, north: 39.8283 },
    zoom: 10
  })

  // Sales data state - map is source of truth
  const [mapSales, setMapSales] = useState<Sale[]>(initialSales)
  const [loading, setLoading] = useState(false)
  const [fetchedOnce, setFetchedOnce] = useState(false)
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [dateWindow, setDateWindow] = useState<any>(null)
  const [degraded, setDegraded] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mapUpdating, setMapUpdating] = useState(false)
  const [mapMarkers, setMapMarkers] = useState<{id: string; title: string; lat: number; lng: number}[]>([])
  const [mapError, setMapError] = useState<string | null>(null)
  const [fitBounds, setFitBounds] = useState<{ north: number; south: number; east: number; west: number; reason?: string } | null>(null)

  // Diagnostic overlay state
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === '1'

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

  // Fetch sales based on map viewport bounds (bbox-based only)
  const fetchMapSales = useCallback(async (centerOverride?: { lat: number; lng: number }) => {
    const center = centerOverride || mapView.center
    if (!center) return

    setLoading(true)
    setMapUpdating(true)

    try {
      const params = new URLSearchParams()
      params.set('minLng', mapView.bounds.west.toString())
      params.set('minLat', mapView.bounds.south.toString())
      params.set('maxLng', mapView.bounds.east.toString())
      params.set('maxLat', mapView.bounds.north.toString())
      
      if (filters.dateRange) {
        params.set('dateRange', filters.dateRange)
      }
      if (filters.categories && filters.categories.length > 0) {
        params.set('categories', filters.categories.join(','))
      }

      console.log('[FETCH] Viewport fetch with bbox:', {
        minLng: mapView.bounds.west,
        minLat: mapView.bounds.south,
        maxLng: mapView.bounds.east,
        maxLat: mapView.bounds.north
      })

      const response = await fetch(`/api/sales/markers?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      // Validate API response shape before processing
      if (!data || typeof data !== 'object') {
        console.error('[FETCH] Invalid response shape:', data)
        setMapError('Invalid response from server')
        return
      }

      if (data.ok && Array.isArray(data.data)) {
        const deduplicated = deduplicateSales(data.data)
        console.log('[FETCH] Applied deduplication:', { input: data.data.length, output: deduplicated.length })
        setMapSales(deduplicated)
        setMapMarkers(deduplicated.map(sale => ({
          id: sale.id,
          title: sale.title,
          lat: sale.lat,
          lng: sale.lng
        })))
      } else {
        console.log('[FETCH] No data in response:', data)
        setMapSales([])
        setMapMarkers([])
      }
    } catch (error) {
      console.error('[FETCH] Map sales error:', error)
      setMapError('Failed to load sales')
    } finally {
      setLoading(false)
      setMapUpdating(false)
    }
  }, [mapView.bounds, filters.dateRange, filters.categories, deduplicateSales])

  // Debounce timer for viewport changes
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Handle map view changes with debouncing
  const handleMapViewChange = useCallback(({ center, zoom, userInteraction }: { center: { lat: number; lng: number }, zoom: number, userInteraction: boolean }) => {
    setMapView(prev => ({
      ...prev,
      center,
      zoom
    }))

    if (userInteraction) {
      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      
      // Debounce fetch by 75ms to prevent rapid successive calls
      debounceTimerRef.current = setTimeout(() => {
        fetchMapSales(center)
      }, 75)
    }
  }, [fetchMapSales])

  // Handle ZIP search
  const handleZipLocationFound = (lat: number, lng: number, city?: string, state?: string, zip?: string) => {
    setZipError(null)
    
    // Update map center
    setMapView(prev => ({
      ...prev,
      center: { lat, lng },
      zoom: 12
    }))

    // Update URL
    const currentParams = new URLSearchParams(searchParams.toString())
    currentParams.set('zip', zip || '')
    router.replace(`/sales?${currentParams.toString()}`, { scroll: false })

    // Fetch sales for new location
    fetchMapSales({ lat, lng })
  }

  const handleZipError = (error: string) => {
    setZipError(error)
  }

  // Handle filter changes
  const handleFiltersChange = (newFilters: any) => {
    updateFilters(newFilters)
    // Trigger refetch with new filters
    fetchMapSales()
  }

  // Memoized visible sales - always derived from mapSales
  const visibleSales = useMemo(() => {
    return deduplicateSales(mapSales)
  }, [mapSales, deduplicateSales])

  // Memoized map center
  const mapCenter = useMemo(() => {
    return mapView.center
  }, [mapView.center])

  const mapZoom = mapView.zoom

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Yard Sales</h1>
          <div className="flex items-center space-x-4">
            <FilterTrigger 
              onOpen={() => setShowFiltersModal(true)}
              hasActiveFilters={hasActiveFilters}
            />
            {user && (
              <div className="text-sm text-gray-600">
                Welcome, {user.email}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center space-x-4">
          <ZipInput
            onLocationFound={handleZipLocationFound}
            onError={handleZipError}
            placeholder="Enter ZIP code"
            className="w-48"
          />
          <div className="flex items-center space-x-2">
            <DateWindowLabel dateRange={filters.dateRange} />
            <span className="text-sm text-gray-600">
              {filters.distance} miles
            </span>
          </div>
        </div>
        {zipError && (
          <div className="mt-2 text-sm text-red-600">{zipError}</div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1">
          <SalesMap
            sales={mapSales}
            markers={mapMarkers}
            center={mapCenter}
            zoom={mapZoom}
            onViewChange={handleMapViewChange}
            onMoveEnd={() => {
              // Trigger fetch after map movement completes
              fetchMapSales()
            }}
            fitBounds={fitBounds}
            onFitBoundsComplete={() => setFitBounds(null)}
          />
        </div>

        {/* Sales List */}
        <div className="w-96 bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">
              Sales ({visibleSales.length})
            </h2>
            
            {loading && (
              <div className="space-y-4">
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
              <div className="space-y-4">
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
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Diagnostic Overlay */}
      {showDiagnostics && (
        <DiagnosticOverlay
          sales={visibleSales}
          loading={loading}
          mapCenter={mapCenter}
          mapZoom={mapZoom}
          onClose={() => setShowDiagnostics(false)}
        />
      )}
    </div>
  )
}