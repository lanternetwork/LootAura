'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import SimpleMap from '@/components/location/SimpleMap'
import MobileSaleCallout from '@/components/sales/MobileSaleCallout'
import MobileFiltersModal from '@/components/sales/MobileFiltersModal'
import SalesList from '@/components/SalesList'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import { Sale } from '@/lib/types'
import { DateRangeType } from '@/lib/hooks/useFilters'
import { HybridPinsResult } from '@/lib/pins/types'
import { requestGeolocation, isGeolocationAvailable } from '@/lib/map/geolocation'

const HEADER_HEIGHT = 64 // px

type MobileMode = 'map' | 'list'

interface MobileSalesShellProps {
  // Map props
  mapView: { center: { lat: number; lng: number }; zoom: number; bounds: { west: number; south: number; east: number; north: number } } | null
  pendingBounds: { west: number; south: number; east: number; north: number } | null
  mapSales: Sale[]
  selectedPinId: string | null
  onViewportChange: (args: { center: { lat: number; lng: number }; zoom: number; bounds: { west: number; south: number; east: number; north: number } }) => void
  onViewportMove?: (args: { center: { lat: number; lng: number }; zoom: number; bounds: { west: number; south: number; east: number; north: number } }) => void
  onCenteringStart?: (locationId: string, lat: number, lng: number) => void
  onCenteringEnd?: () => void
  onLocationClick: (locationId: string) => void
  onClusterClick: (args: { lat: number; lng: number; expandToZoom: number }) => void
  currentViewport: { bounds: [number, number, number, number]; zoom: number } | null
  
  // Sales list props
  visibleSales: Sale[]
  loading: boolean
  isFetching?: boolean // Track if a buffer update is in progress
  hasCompletedInitialLoad?: boolean // Track if initial load has completed
  
  // Filter props
  filters: {
    dateRange: DateRangeType
    categories: string[]
    distance: number
  }
  onFiltersChange: (newFilters: any) => void
  onClearFilters: () => void
  onZipLocationFound: (lat: number, lng: number, city?: string, state?: string, zip?: string, bbox?: [number, number, number, number]) => void
  onZipError: (error: string) => void
  zipError: string | null
  hasActiveFilters: boolean
  
  // Hybrid result for location-based pin selection
  hybridResult?: HybridPinsResult | null
  
  // User location for recenter button visibility
  userLocation: { lat: number; lng: number } | null
  
  // Callback for user-initiated GPS (bypasses authority guard)
  // Receives location and optional map instance for imperative recentering
  onUserLocationRequest: (location: { lat: number; lng: number }, mapInstance?: any, source?: 'gps' | 'ip') => void
  
  // Visibility flag for location icon (computed in SalesClient)
  shouldShowLocationIcon: boolean
}

/**
 * Mobile-only sales shell component that provides:
 * - Full-screen map mode (default)
 * - Full-screen list mode
 * - Small callout card on pin selection (instead of large bottom tray)
 * - Full-screen filters modal (instead of persistent filter bar)
 */
export default function MobileSalesShell({
  mapView,
  pendingBounds,
  mapSales,
  selectedPinId,
  onViewportChange,
  onViewportMove,
  onCenteringStart,
  onCenteringEnd,
  onLocationClick,
  onClusterClick,
  currentViewport,
  visibleSales,
  loading,
  isFetching = false,
  hasCompletedInitialLoad = false,
  filters,
  onFiltersChange,
  onClearFilters,
  onZipLocationFound,
  onZipError,
  zipError,
  hasActiveFilters,
  hybridResult,
  userLocation: _userLocation, // Unused - we use actualUserLocation (GPS) instead of userLocation prop (map center)
  onUserLocationRequest, // Callback for user-initiated GPS (bypasses authority guard)
  shouldShowLocationIcon // Visibility flag computed in SalesClient
}: MobileSalesShellProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Initialize mode from URL param, default to 'map'
  const initialMode = (searchParams?.get('view') === 'list' ? 'list' : 'map') as MobileMode
  
  // Mobile-only state
  const [mode, setMode] = useState<MobileMode>(initialMode)
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false)
  const mapRef = useRef<any>(null)
  const [pinPosition, setPinPosition] = useState<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef<boolean>(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  
  // Capability detection: separate from layout breakpoint
  // Desktop browsers resized to mobile width do not have GPS capability
  const canUsePreciseGeolocation = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    if (!('geolocation' in navigator)) return false
    if (!window.isSecureContext) return false
    
    // Check if this is likely a desktop environment (no touch support)
    const isLikelyDesktopEnvironment = 
      !('ontouchstart' in window) && 
      navigator.maxTouchPoints === 0
    
    return !isLikelyDesktopEnvironment
  }, [])

  // Sync mode to URL params
  useEffect(() => {
    const currentView = searchParams?.get('view')
    const newView = mode === 'list' ? 'list' : null // Only set 'list', remove param for 'map'
    
    if (currentView !== newView) {
      const params = new URLSearchParams()
      // Copy all existing params except 'view'
      if (searchParams) {
        searchParams.forEach((value, key) => {
          if (key !== 'view') {
            params.set(key, value)
          }
        })
      }
      // Add 'view' param if needed
      if (newView) {
        params.set('view', newView)
      }
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
      router.replace(newUrl, { scroll: false })
    }
  }, [mode, searchParams, router])
  
  // Find selected sale from selectedPinId
  // selectedPinId can be either a sale ID or a location ID
  const selectedSale = useMemo(() => {
    if (!selectedPinId) return null
    
    // First, try to find by sale ID (for single-sale locations)
    const saleById = mapSales.find(sale => sale.id === selectedPinId)
    if (saleById) return saleById
    
    // If not found, it might be a location ID - find the location and get first sale
    if (hybridResult?.locations) {
      const location = hybridResult.locations.find(loc => loc.id === selectedPinId)
      if (location && location.sales.length > 0) {
        return location.sales[0]
      }
    }
    
    return null
  }, [selectedPinId, mapSales, hybridResult])
  
  // Get pin coordinates for selected location
  const selectedPinCoords = useMemo(() => {
    if (!selectedPinId || !hybridResult) return null
    
    // Find location by ID
    const location = hybridResult.locations.find(loc => loc.id === selectedPinId)
    if (location) {
      return { lat: location.lat, lng: location.lng }
    }
    
    // If not found, try to find sale by ID
    const sale = mapSales.find(sale => sale.id === selectedPinId)
    if (sale && typeof sale.lat === 'number' && typeof sale.lng === 'number') {
      return { lat: sale.lat, lng: sale.lng }
    }
    
    return null
  }, [selectedPinId, hybridResult, mapSales])
  
  // Convert pin coordinates to screen position
  useEffect(() => {
    if (!selectedPinCoords || !mapRef.current) {
      setPinPosition(null)
      return
    }
    
    const map = mapRef.current.getMap?.()
    if (!map || typeof map.project !== 'function') {
      setPinPosition(null)
      return
    }
    
    try {
      const point = map.project([selectedPinCoords.lng, selectedPinCoords.lat])
      setPinPosition({ x: point.x, y: point.y })
    } catch (error) {
      setPinPosition(null)
    }
  }, [selectedPinCoords, mapView, currentViewport])
  
  // Update position on map move/zoom
  // Skip updates during dragging to prevent flashing
  useEffect(() => {
    if (!selectedPinCoords || !mapRef.current) return
    
    const map = mapRef.current.getMap?.()
    if (!map) return
    
    const updatePosition = () => {
      // Don't update position during dragging
      if (isDraggingRef.current) return
      
      try {
        const point = map.project([selectedPinCoords.lng, selectedPinCoords.lat])
        setPinPosition({ x: point.x, y: point.y })
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
  
  // Handle mode toggle
  const handleToggleMode = useCallback(() => {
    setMode(prev => prev === 'map' ? 'list' : 'map')
  }, [])

  // Visibility is now controlled by shouldShowLocationIcon prop from SalesClient
  // This ensures a single source of truth for visibility logic

  // Handle "Use my location" button - handles both permission request and recentering
  const [isLocationLoading, setIsLocationLoading] = useState(false)
  const handleUseMyLocation = useCallback(async () => {
    // Immediately recenter with IP location (don't block on GPS)
    const mapInstance = mapRef.current?.getMap?.()
    try {
      const ipRes = await fetch('/api/geolocation/ip')
      if (ipRes.ok) {
        const ipData = await ipRes.json()
        if (ipData.lat && ipData.lng) {
          // Recenter immediately with IP location
          onUserLocationRequest({ lat: ipData.lat, lng: ipData.lng }, mapInstance, 'ip')
        }
      }
    } catch {
      // Ignore IP errors - continue to GPS attempt
    }

    // Fire GPS in background (don't block recentering)
    if (!isGeolocationAvailable()) {
      return
    }

    setIsLocationLoading(true)

    // Fire GPS request without blocking
    const timeout = canUsePreciseGeolocation ? 10000 : 5000
    requestGeolocation({
      enableHighAccuracy: canUsePreciseGeolocation,
      timeout,
      maximumAge: 300000
    }).then((location) => {
      // GPS resolved - handler will check if it differs meaningfully and recenter if needed
      onUserLocationRequest(location, mapInstance, 'gps')
      flushSync(() => {
        setIsLocationLoading(false)
      })
    }).catch((error) => {
      // GPS failed - try low accuracy if GPS-capable
      const geoError = error as { code?: number; message?: string }
      if (geoError.code === 3 && canUsePreciseGeolocation) {
        // Timeout on GPS-capable device - try low accuracy
        requestGeolocation({
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 300000
        }).then((location) => {
          onUserLocationRequest(location, mapInstance, 'gps')
          flushSync(() => {
            setIsLocationLoading(false)
          })
        }).catch(() => {
          flushSync(() => {
            setIsLocationLoading(false)
          })
        })
      } else {
        flushSync(() => {
          setIsLocationLoading(false)
        })
      }
    })
  }, [canUsePreciseGeolocation, onUserLocationRequest])
  
  // Close callout when map is clicked or moved
  const handleMapClick = useCallback(() => {
    if (selectedPinId) {
      onLocationClick(selectedPinId)
    }
  }, [selectedPinId, onLocationClick])
  
  const handleViewportChangeWithDismiss = useCallback((args: { 
    center: { lat: number; lng: number }; 
    zoom: number; 
    bounds: { west: number; south: number; east: number; north: number } 
  }) => {
    // Clear dragging flag on moveEnd
    isDraggingRef.current = false
    // Don't close callout on moveEnd - let user drag map freely
    // Callout will close when user taps outside or explicitly dismisses
    onViewportChange(args)
  }, [onViewportChange])
  
  // Map viewport for callout
  const mapViewport = useMemo(() => {
    if (!mapView) return null
    return {
      center: mapView.center,
      zoom: mapView.zoom
    }
  }, [mapView])
  
  // Track when map is loaded
  useEffect(() => {
    if (mapRef.current) {
      const checkLoaded = () => {
        const isLoaded = mapRef.current?.isLoaded?.()
        if (isLoaded) {
          setMapLoaded(true)
        }
      }
      
      // Check immediately
      checkLoaded()
      
      // Also check periodically until loaded (in case map loads after component mounts)
      const interval = setInterval(() => {
        checkLoaded()
        if (mapRef.current?.isLoaded?.()) {
          clearInterval(interval)
        }
      }, 100)
      
      return () => clearInterval(interval)
    }
  }, [])
  
  // Resize map when it becomes visible (mode switches to 'map' and map is loaded)
  useEffect(() => {
    if (mode === 'map' && mapLoaded && mapRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        const map = mapRef.current?.getMap?.()
        if (map) {
          map.resize()
        }
      })
    }
  }, [mode, mapLoaded])
  
  return (
    <div 
      className="flex flex-col overflow-hidden md:hidden relative" 
      style={{ height: `calc(100vh - ${HEADER_HEIGHT}px)` }}
    >
      {/* Map Mode - Always mounted, visibility controlled by CSS */}
      <div 
        className={`absolute inset-0 transition-opacity duration-200 ${
          mode === 'map' && mapView
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleMapClick}
      >
        {mapView && (
          <div className="relative w-full h-full bg-gray-100">
            {/* Full-screen map */}
            <SimpleMap
              ref={mapRef}
              center={mapView.center}
              zoom={pendingBounds ? undefined : mapView.zoom}
              fitBounds={pendingBounds}
              fitBoundsOptions={pendingBounds ? { 
                padding: 0, // No padding to show exact bounds
                duration: 300, // Smooth transition
                maxZoom: 15 // Prevent over-zooming
              } : undefined}
              hybridPins={currentViewport ? {
                sales: mapSales,
                selectedId: selectedPinId,
                onLocationClick: onLocationClick,
                onClusterClick: onClusterClick,
                viewport: currentViewport
              } : undefined}
              onViewportMove={onViewportMove}
              onViewportChange={handleViewportChangeWithDismiss}
              onDragStart={() => {
                // Set dragging flag to prevent pinPosition updates during drag
                isDraggingRef.current = true
              }}
              onCenteringStart={onCenteringStart}
              onCenteringEnd={onCenteringEnd}
              onMapClick={() => {
                if (selectedPinId) {
                  onLocationClick(selectedPinId)
                }
              }}
              attributionPosition="top-right"
              showOSMAttribution={true}
              attributionControl={false}
              interactive={mode === 'map'}
              skipCenteringOnClick={true}
            />
            
            {/* Floating Action Buttons */}
            <div className="absolute inset-0 pointer-events-none z-[110]">
              {/* Filters FAB - Top Left - Toggle behavior */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  // Toggle: if open, close (discard changes); if closed, open
                  setIsFiltersModalOpen(prev => !prev)
                }}
                className="absolute top-4 left-4 pointer-events-auto bg-white hover:bg-gray-50 shadow-lg rounded-full p-3 min-w-[48px] min-h-[48px] flex items-center justify-center transition-colors"
                aria-label={isFiltersModalOpen ? "Close filters" : "Open filters"}
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {hasActiveFilters && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#F4B63A] rounded-full"></span>
                )}
              </button>
              
              {/* Location icon button - Handles both permission request and recentering */}
              {shouldShowLocationIcon && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleUseMyLocation()
                  }}
                  disabled={isLocationLoading}
                  className="absolute bottom-36 right-4 pointer-events-auto bg-white hover:bg-gray-50 shadow-lg rounded-full p-3 min-w-[48px] min-h-[48px] flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Use my location"
                  title="Use my location"
                >
                  {isLocationLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-gray-600"></div>
                  ) : (
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              )}
              
              {/* Mode Toggle FAB - Bottom Right */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleToggleMode()
                }}
                className="absolute bottom-20 right-4 pointer-events-auto bg-white hover:bg-gray-50 shadow-lg rounded-full p-3 min-w-[48px] min-h-[48px] flex items-center justify-center transition-colors"
                aria-label={mode === 'map' ? 'Switch to list view' : 'Switch to map view'}
              >
                {mode === 'map' ? (
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                )}
              </button>
            </div>
            
            {/* Callout Card - Shows when a sale is selected */}
            {selectedSale && pinPosition && (
              <MobileSaleCallout
                sale={selectedSale}
                onDismiss={() => onLocationClick(selectedPinId || '')}
                viewport={mapViewport}
                pinPosition={pinPosition}
              />
            )}
          </div>
        )}
      </div>
      
      {/* List Mode - Always mounted, visibility controlled by CSS */}
      <div 
        className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${
          mode === 'list' 
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}
      >
          {/* Sticky Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Sales ({visibleSales.length})
            </h2>
            {isFetching && !loading && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-300 border-t-gray-600"></div>
                <span>Updating...</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFiltersModalOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Open filters"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {hasActiveFilters && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#F4B63A] rounded-full"></span>
                )}
              </button>
              <button
                onClick={handleToggleMode}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Switch to map view"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SaleCardSkeleton key={i} />
                ))}
              </div>
            )}
            
            {!loading && hasCompletedInitialLoad && visibleSales.length === 0 && (
              <div className="text-center py-12 px-4">
                <div className="text-gray-500 mb-2">
                  No sales found in this area
                </div>
                <div className="text-sm text-gray-400 space-y-1 mb-4">
                  {filters.distance < 10 && <div>Try increasing your distance filter</div>}
                  {filters.dateRange !== 'any' && <div>Try widening your date range</div>}
                  {filters.categories.length > 0 && <div>Try clearing category filters</div>}
                  {(!filters.distance || filters.distance < 10) && filters.dateRange === 'any' && filters.categories.length === 0 && <div>Try zooming out or panning to a different area</div>}
                </div>
                <button
                  onClick={() => setIsFiltersModalOpen(true)}
                  className="text-[#F4B63A] hover:text-[#dca32f] font-medium"
                >
                  Adjust filters →
                </button>
              </div>
            )}
            
            {!loading && visibleSales.length > 0 && (
              <div className="p-4">
                <SalesList 
                  sales={visibleSales} 
                  _mode="grid" 
                  viewport={mapViewport || { center: { lat: 39.8283, lng: -98.5795 }, zoom: 10 }}
                  isLoading={loading}
                />
              </div>
            )}
          </div>
          
          {/* Floating Action Button - Map icon when in list mode */}
          <div className="absolute inset-0 pointer-events-none z-10">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleToggleMode()
              }}
              className="absolute bottom-20 right-4 pointer-events-auto bg-white hover:bg-gray-50 shadow-lg rounded-full p-3 min-w-[48px] min-h-[48px] flex items-center justify-center transition-colors"
              aria-label="Switch to map view"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </button>
          </div>
      </div>
      
      {/* Filters Modal */}
      <MobileFiltersModal
        isOpen={isFiltersModalOpen}
        onClose={() => setIsFiltersModalOpen(false)}
        dateRange={filters.dateRange}
        onDateRangeChange={(dateRange: DateRangeType) => onFiltersChange({ ...filters, dateRange })}
        categories={filters.categories}
        onCategoriesChange={(categories) => onFiltersChange({ ...filters, categories })}
        distance={filters.distance}
        onDistanceChange={(distance) => onFiltersChange({ ...filters, distance })}
        hasActiveFilters={hasActiveFilters}
        isLoading={loading}
        onClearFilters={onClearFilters}
        onZipLocationFound={onZipLocationFound}
        onZipError={onZipError}
        zipError={zipError}
        currentZip={(() => {
          // Get current ZIP from cookie if available
          if (typeof document !== 'undefined') {
            try {
              const cookies = document.cookie.split(';')
              const laLocCookie = cookies.find(c => c.trim().startsWith('la_loc='))
              if (laLocCookie) {
                const value = laLocCookie.split('=')[1]
                const parsed = JSON.parse(decodeURIComponent(value))
                return parsed?.zip || null
              }
            } catch {
              // Ignore parse errors
            }
          }
          return null
        })()}
      />
    </div>
  )
}

