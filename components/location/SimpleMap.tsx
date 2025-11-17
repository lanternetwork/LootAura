'use client'

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react"
import Map, { Popup } from "react-map-gl"
import { getMapboxToken } from "@/lib/maps/token"
import { Sale } from "@/lib/types"
import { PinsProps, HybridPinsProps } from "@/lib/pins/types"
import PinsOverlay from "./PinsOverlay"
import HybridPinsOverlay from "./HybridPinsOverlay"
import AttributionOSM from "./AttributionOSM"

interface SimpleMapProps {
  center: { lat: number; lng: number }
  zoom?: number | undefined // undefined means let fitBounds or map determine zoom
  fitBounds?: { west: number; south: number; east: number; north: number } | null
  fitBoundsOptions?: { padding?: number; duration?: number } // Allow custom fitBounds options
  sales?: Sale[]
  onSaleClick?: (sale: Sale) => void
  selectedSaleId?: string
  pins?: PinsProps
  hybridPins?: HybridPinsProps
  onViewportChange?: (args: { 
    center: { lat: number; lng: number }; 
    zoom: number; 
    bounds: { west: number; south: number; east: number; north: number } 
  }) => void
  isTransitioning?: boolean
  transitionMessage?: string
  interactive?: boolean // Disable all map interactions when false
  attributionPosition?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left' // Position of OSM attribution overlay
  showOSMAttribution?: boolean // Show OSM attribution overlay
  attributionControl?: boolean // Show Mapbox attribution control (default: true)
  bottomSheetHeight?: number // Height of bottom sheet in pixels (for mobile) - used for map resizing and pin centering offset
  skipCenteringOnClick?: boolean // Skip centering behavior and immediately select on first click (for mobile)
}

const SimpleMap = forwardRef<any, SimpleMapProps>(({ 
  center, 
  zoom = 11, 
  fitBounds,
  fitBoundsOptions = { padding: 20, duration: 400 },
  sales = [],
  onSaleClick,
  selectedSaleId,
  pins,
  hybridPins,
  onViewportChange,
  isTransitioning = false,
  transitionMessage = "Loading...",
  interactive = true,
  attributionPosition = 'bottom-right',
  showOSMAttribution = true,
  attributionControl = true,
  bottomSheetHeight = 0,
  skipCenteringOnClick = false
}, ref) => {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [pinsLoading, setPinsLoading] = useState(false)
  const lastBoundsKey = useRef<string>("")
  
  const token = getMapboxToken()
  
  // Debug token status
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SIMPLE_MAP] Token status:', {
        hasToken: !!token,
        tokenLength: token?.length || 0,
        tokenPrefix: token?.substring(0, 10) + '...' || 'none'
      })
    }
  }, [token])
  
  // Track when pins finish loading
  useEffect(() => {
    if (loaded) {
      const pinCount = hybridPins?.sales.length || pins?.sales.length || sales.length
      if (pinCount > 0) {
        // Small delay to ensure pins are rendered
        const timer = setTimeout(() => {
          setPinsLoading(false)
        }, 300)
        return () => clearTimeout(timer)
      } else {
        setPinsLoading(false)
      }
    }
  }, [loaded, hybridPins?.sales.length, pins?.sales.length, sales.length])

  // Check if clustering is enabled - FORCE DISABLED to prevent blue circles
  const isClusteringEnabled = false  // Disabled to prevent blue cluster markers

  // Expose the map instance to parent components
  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current?.getMap?.(),
    isLoaded: () => loaded
  }), [loaded])

  const onLoad = useCallback(() => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[MAP] onLoad - Map initialization completed')
    }
    setLoaded(true)
    setMapError(null) // Clear any previous errors on successful load
    setPinsLoading(true) // Start loading pins
    mapRef.current?.getMap()?.resize()
    
    // Trigger initial viewport change to set proper bounds
    if (mapRef.current) {
      const map = mapRef.current.getMap()
      if (map) {
        const center = map.getCenter()
        const zoom = map.getZoom()
        const bounds = map.getBounds()
        
        const viewport = {
          center: { lat: center.lat, lng: center.lng },
          zoom,
          bounds: {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
          }
        }
        
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[MAP] onLoad - Initial viewport:', viewport)
          console.log('[MAP] onLoad - Bounds range:', {
            latRange: viewport.bounds.north - viewport.bounds.south,
            lngRange: viewport.bounds.east - viewport.bounds.west,
            center: viewport.center,
            zoom: viewport.zoom
          })
          console.log('[MAP] onLoad - Bounds area (square degrees):', (viewport.bounds.north - viewport.bounds.south) * (viewport.bounds.east - viewport.bounds.west))
        }
        onViewportChange?.(viewport)
      }
    }
  }, [onViewportChange])

  const onStyleData = useCallback(() => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[MAP] onStyleData')
    }
    // Only resize if map is not already loaded to avoid excessive resizing
    if (!loaded) {
      mapRef.current?.getMap()?.resize()
    }
  }, [loaded])

  const handleMoveEnd = useCallback(() => {
    if (!mapRef.current) return
    
    const map = mapRef.current.getMap()
    if (!map) return

    const center = map.getCenter()
    const zoom = map.getZoom()
    const bounds = map.getBounds()
    
    const viewport = {
      center: { lat: center.lat, lng: center.lng },
      zoom,
      bounds: {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[MAP] onMoveEnd:', viewport)
      console.log('[MAP] onMoveEnd - Bounds range:', {
        latRange: viewport.bounds.north - viewport.bounds.south,
        lngRange: viewport.bounds.east - viewport.bounds.west,
        center: viewport.center
      })
    }
    onViewportChange?.(viewport)
  }, [onViewportChange])

  // Handle cluster click
  const handleClusterClick = useCallback((cluster: any) => {
    if (!mapRef.current) return
    
    const map = mapRef.current.getMap()
    if (!map) return

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[CLUSTER] expand', { lat: cluster.lat, lng: cluster.lng, expandToZoom: cluster.expandToZoom })
    }
    
    // Calculate vertical offset for pin centering (move pin up by half of bottom sheet height)
    const offsetY = bottomSheetHeight > 0 ? -bottomSheetHeight / 2 : 0
    
    // TEMPORARILY DISABLED: Zoom functionality works but is disabled for UX testing
    // Original zoom behavior (commented out):
    // map.flyTo({
    //   center: [cluster.lng, cluster.lat],
    //   zoom: cluster.expandToZoom,
    //   duration: 400
    // })
    
    // TEMPORARY: Just center the map on the cluster without zooming
    const flyToOptions: any = {
      center: [cluster.lng, cluster.lat],
      duration: 400
    }
    // Only include offset if we have a non-zero offset value
    if (offsetY !== 0) {
      flyToOptions.offset = { x: 0, y: offsetY }
    }
    map.flyTo(flyToOptions)
    
    // Call the onClusterClick callback if provided
    pins?.onClusterClick?.(cluster)
  }, [pins, bottomSheetHeight])

  // First-click-to-center, second-click-to-select for location pins
  const centeredLocationRef = useRef<Record<string, boolean>>({})
  const previousSelectedIdRef = useRef<string | null>(null)
  
  const handleLocationClickWrapped = useCallback((locationId: string, lat?: number, lng?: number) => {
    const alreadyCentered = centeredLocationRef.current[locationId]
    const isCurrentlySelected = hybridPins?.selectedId === locationId
    
    // If this location is already selected, always toggle (don't center again)
    if (isCurrentlySelected) {
      hybridPins?.onLocationClick?.(locationId)
      return
    }
    
    // If skipCenteringOnClick is true (mobile), immediately select without centering
    if (skipCenteringOnClick) {
      hybridPins?.onLocationClick?.(locationId)
      return
    }
    
    // First click: center the map
    if (!alreadyCentered && loaded && mapRef.current?.getMap) {
      const map = mapRef.current.getMap()
      if (map && typeof lat === 'number' && typeof lng === 'number') {
        try {
          // Calculate vertical offset for pin centering (move pin up by half of bottom sheet height)
          const offsetY = bottomSheetHeight > 0 ? -bottomSheetHeight / 2 : 0
          const flyToOptions: any = {
            center: [lng, lat],
            duration: 400
          }
          // Only include offset if we have a non-zero offset value
          if (offsetY !== 0) {
            flyToOptions.offset = { x: 0, y: offsetY }
          }
          map.flyTo(flyToOptions)
          centeredLocationRef.current[locationId] = true
          return
        } catch (error) {
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.error('[MAP] flyTo error:', error)
          }
          // Fall through to select location if flyTo fails
        }
      }
    }
    
    // Second click (or if we couldn't center): select location
    hybridPins?.onLocationClick?.(locationId)
  }, [hybridPins?.onLocationClick, hybridPins?.selectedId, bottomSheetHeight, skipCenteringOnClick, loaded])
  
  // Reset centered flag when location is deselected or a different location is selected
  useEffect(() => {
    const currentSelectedId = hybridPins?.selectedId || null
    const previousSelectedId = previousSelectedIdRef.current
    
    if (!currentSelectedId) {
      // Nothing selected: clear all centered flags
      centeredLocationRef.current = {}
    } else if (currentSelectedId !== previousSelectedId) {
      // Different location selected: clear the previous location's flag
      if (previousSelectedId) {
        delete centeredLocationRef.current[previousSelectedId]
      }
      // Keep the new location's flag if it exists (so clicking it again will toggle)
    }
    
    previousSelectedIdRef.current = currentSelectedId
  }, [hybridPins?.selectedId])

  // Handle fitBounds
  useEffect(() => {
    if (!loaded || !mapRef.current || !fitBounds) return
    
    const boundsKey = `${fitBounds.west}|${fitBounds.south}|${fitBounds.east}|${fitBounds.north}`
    
    if (boundsKey !== lastBoundsKey.current) {
      console.log('[MAP] fitBounds:', fitBounds, 'options:', fitBoundsOptions)
      const map = mapRef.current.getMap()
      if (map) {
        map.fitBounds(
          [[fitBounds.west, fitBounds.south], [fitBounds.east, fitBounds.north]], 
          fitBoundsOptions
        )
        lastBoundsKey.current = boundsKey
      }
    }
  }, [fitBounds, fitBoundsOptions, loaded])

  // Handle center/zoom changes
  // Skip center/zoom updates when fitBounds is active to prevent zoom flash
  useEffect(() => {
    if (!loaded || !mapRef.current || fitBounds) return
    
    const map = mapRef.current.getMap()
    if (!map) return

    const currentCenter = map.getCenter()
    const currentZoom = map.getZoom()
    
    const latDiff = Math.abs(currentCenter.lat - center.lat)
    const lngDiff = Math.abs(currentCenter.lng - center.lng)
    const zoomDiff = Math.abs(currentZoom - zoom)
    
    if (latDiff > 1e-5 || lngDiff > 1e-5 || zoomDiff > 0.01) {
      console.log('[MAP] easeTo:', { center, zoom })
      map.easeTo({
        center: [center.lng, center.lat],
        zoom,
        duration: 400
      })
    }
  }, [center.lat, center.lng, zoom, loaded, fitBounds])

  // Resize map when bottomSheetHeight changes (for mobile bottom sheet)
  // This ensures the map recalculates its viewport when the container height changes
  useEffect(() => {
    if (!loaded || !mapRef.current) return
    
    // Use requestAnimationFrame to ensure resize happens after layout
    requestAnimationFrame(() => {
      const map = mapRef.current?.getMap()
      if (map) {
        map.resize()
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[MAP] Resized due to bottomSheetHeight change:', bottomSheetHeight)
        }
      }
    })
  }, [bottomSheetHeight, loaded])

  // ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        // Map resize logging reduced for performance
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[MAP_RESIZE] Container resized:', { width, height })
        }
        
        if (loaded && mapRef.current) {
          const map = mapRef.current.getMap()
          if (map) {
            map.resize()
          }
        }
      }
    })
    
    resizeObserver.observe(containerRef.current)
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [loaded])

  return (
    <div ref={containerRef} className="relative min-h-0 min-w-0 w-full h-full" style={{ overflow: 'visible' }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={{
          longitude: center.lng,
          latitude: center.lat,
          zoom
        }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ position: "absolute", inset: 0 }}
        onLoad={onLoad}
        onStyleData={onStyleData}
        onMoveEnd={handleMoveEnd}
        onError={(error: any) => {
          console.error('[SIMPLE_MAP] Map error:', error)
          setMapError('Unable to load map. Please check your connection and try again.')
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[SIMPLE_MAP] Token for debugging:', {
              hasToken: !!token,
              tokenLength: token?.length || 0
            })
          }
        }}
        dragPan={interactive}
        dragRotate={interactive}
        scrollZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        touchRotate={interactive}
        keyboard={interactive}
        attributionControl={attributionControl}
      >
        {/* Custom pin rendering - no Mapbox Markers */}
        {hybridPins ? (
          <HybridPinsOverlay
            sales={hybridPins.sales}
            selectedId={hybridPins.selectedId}
            onLocationClick={hybridPins.onLocationClick}
            onLocationClickWithCoords={(id, lat, lng) => handleLocationClickWrapped(id, lat, lng)}
            onClusterClick={handleClusterClick}
            mapRef={{ current: { getMap: () => mapRef.current?.getMap?.() } }}
            viewport={hybridPins.viewport}
          />
        ) : pins ? (
          <>
            <PinsOverlay
              sales={pins.sales}
              selectedId={pins.selectedId}
              onPinClick={pins.onPinClick}
              onClusterClick={handleClusterClick}
              mapRef={{ current: { getMap: () => mapRef.current?.getMap?.() } }}
              isClusteringEnabled={isClusteringEnabled}
            />
          </>
        ) : (
          /* Custom pin rendering for sales */
          sales
            .filter(sale => typeof sale.lat === 'number' && typeof sale.lng === 'number')
            .map(sale => (
              <div
                key={sale.id}
                style={{
                  position: 'absolute',
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#ef4444',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  border: '1px solid white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  outline: 'none !important',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 1000
                }}
                onClick={() => onSaleClick?.(sale)}
                role="button"
                tabIndex={0}
                aria-label={`Sale: ${sale.title}`}
                data-testid="marker"
              />
            ))
        )}
        
        {/* Selected sale popup */}
        {selectedSaleId && (
          <Popup
            longitude={sales.find(s => s.id === selectedSaleId)?.lng || 0}
            latitude={sales.find(s => s.id === selectedSaleId)?.lat || 0}
            anchor="bottom"
            closeButton={true}
            closeOnClick={false}
          >
            <div className="p-2">
              <h3 className="font-semibold text-sm">
                {sales.find(s => s.id === selectedSaleId)?.title}
              </h3>
            </div>
          </Popup>
        )}
      </Map>
      
      {/* Map error message */}
      {mapError && (
        <div className="absolute inset-0 bg-white bg-opacity-95 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-4 text-center">
            <div className="text-red-500 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Map Error</h3>
            <p className="text-gray-600 mb-4">{mapError}</p>
            <button
              onClick={() => {
                setMapError(null)
                window.location.reload()
              }}
              className="px-4 py-2 bg-[var(--accent-primary)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
            >
              Reload Map
            </button>
          </div>
        </div>
      )}

      {/* Loading overlay for smooth transitions */}
      {isTransitioning && (
        <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white rounded-lg shadow-lg p-4 flex items-center space-x-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-[var(--accent-primary)] border-t-transparent"></div>
            <span className="text-gray-700 font-medium">{transitionMessage}</span>
          </div>
        </div>
      )}

      {/* Pins loading skeleton */}
      {pinsLoading && !loaded && (hybridPins || pins) && (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
          <div className="bg-white bg-opacity-80 rounded-lg shadow-md p-4">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-[var(--accent-primary)] border-t-transparent"></div>
              <span className="text-sm text-gray-700 font-medium">Loading sales locations...</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Debug overlay */}
      {process.env.NEXT_PUBLIC_DEBUG === "true" && (
        <div className="absolute top-2 left-2 z-50 bg-black bg-opacity-75 text-white text-xs p-2 rounded pointer-events-none">
          <div>Container: {containerRef.current?.offsetWidth}×{containerRef.current?.offsetHeight}</div>
          <div>Loaded: {loaded ? 'Yes' : 'No'}</div>
          <div>Clustering: {isClusteringEnabled ? 'Enabled' : 'Disabled'}</div>
          <div>Pins: {pins ? pins.sales.length : sales.length}</div>
        </div>
      )}
      
      {/* OSM Attribution */}
      {showOSMAttribution && (
        <AttributionOSM position={attributionPosition} containerRef={containerRef} />
      )}
    </div>
  )
})

SimpleMap.displayName = 'SimpleMap'

export default SimpleMap