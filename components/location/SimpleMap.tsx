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
  fitBoundsOptions?: { padding?: number; duration?: number; maxZoom?: number } // Allow custom fitBounds options
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
  onViewportMove?: (args: { 
    center: { lat: number; lng: number }; 
    zoom: number; 
    bounds: { west: number; south: number; east: number; north: number } 
  }) => void
  onDragStart?: () => void // Called when user starts dragging the map
  onCenteringStart?: (locationId: string, lat: number, lng: number) => void
  onCenteringEnd?: () => void
  isTransitioning?: boolean
  transitionMessage?: string
  interactive?: boolean // Disable all map interactions when false
  attributionPosition?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left' // Position of OSM attribution overlay
  showOSMAttribution?: boolean // Show OSM attribution overlay
  attributionControl?: boolean // Show Mapbox attribution control (default: true)
  bottomSheetHeight?: number // Height of bottom sheet in pixels (for mobile) - used for map resizing and pin centering offset
  skipCenteringOnClick?: boolean // Skip centering behavior and immediately select on first click (for mobile)
  onMapClick?: () => void // Callback when map is clicked (not on pins/markers)
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
  onViewportMove,
  onDragStart,
  onCenteringStart,
  onCenteringEnd,
  isTransitioning = false,
  transitionMessage = "Loading...",
  interactive = true,
  attributionPosition = 'bottom-right',
  showOSMAttribution = true,
  attributionControl = true,
  bottomSheetHeight = 0,
  skipCenteringOnClick = false,
  onMapClick
}, ref) => {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [pinsLoading, setPinsLoading] = useState(false)
  const lastBoundsKey = useRef<string>("")
  
  const token = getMapboxToken()
  
  // Validate token before map loads
  useEffect(() => {
    if (!token || token.length === 0) {
      console.error('[SIMPLE_MAP] No Mapbox token found. Please set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN environment variable.')
      setMapError('Map configuration error: Missing access token. Please contact support.')
      return
    }
    
    // Check token format (should start with pk. for public tokens)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      if (!token.startsWith('pk.') && !token.startsWith('sk.')) {
        console.warn('[SIMPLE_MAP] Token format may be invalid. Expected pk.eyJ... or sk.eyJ...')
      }
      console.log('[SIMPLE_MAP] Token status:', {
        hasToken: !!token,
        tokenLength: token?.length || 0,
        tokenPrefix: token?.substring(0, 15) + '...' || 'none',
        tokenFormat: token.startsWith('pk.') ? 'public' : token.startsWith('sk.') ? 'secret' : 'unknown'
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

  // Handle drag start - close callout immediately when user starts dragging
  // Use native map events to detect drag start more reliably
  useEffect(() => {
    if (!mapRef.current || !loaded) return
    
    const map = mapRef.current.getMap()
    if (!map) return
    
    // Listen for drag start on the map
    const handleDragStart = () => {
      isUserDraggingRef.current = true
      onDragStart?.()
    }
    
    const handleDragEnd = () => {
      // Small delay to ensure all drag-related state updates complete
      setTimeout(() => {
        isUserDraggingRef.current = false
      }, 100)
    }
    
    map.on('dragstart', handleDragStart)
    map.on('dragend', handleDragEnd)
    
    return () => {
      map.off('dragstart', handleDragStart)
      map.off('dragend', handleDragEnd)
    }
  }, [onDragStart, loaded])

  // Handle map move (continuous during drag) - update viewport for live rendering
  const handleMove = useCallback(() => {
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
    
    // Call onViewportMove for live updates (no fetch logic here)
    // Falls back to onViewportChange if onViewportMove not provided
    if (onViewportMove) {
      onViewportMove(viewport)
    } else {
      onViewportChange?.(viewport)
    }
  }, [onViewportChange, onViewportMove])

  // Handle map move end - trigger fetch decision logic
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
    // Also call onViewportChange on moveend for final state update
    onViewportChange?.(viewport)
  }, [onViewportChange])

  // Handle cluster click
  const handleClusterClick = useCallback((cluster: any) => {
    if (!mapRef.current) return
    
    const map = mapRef.current.getMap()
    if (!map) return

    const currentZoom = map.getZoom()
    const targetZoom = cluster.expandToZoom || 16
    
    // Ensure we zoom in at least one level to break the cluster apart
    // Use the higher of: expandToZoom or currentZoom + 1
    const finalZoom = Math.max(targetZoom, currentZoom + 1)

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[CLUSTER] expand', { 
        lat: cluster.lat, 
        lng: cluster.lng, 
        expandToZoom: cluster.expandToZoom,
        currentZoom,
        finalZoom
      })
    }
    
    // Calculate vertical offset for pin centering (move pin up by half of bottom sheet height)
    const offsetY = bottomSheetHeight > 0 ? -bottomSheetHeight / 2 : 0
    
    // Zoom to cluster expansion zoom level to break the cluster apart
    const flyToOptions: any = {
      center: [cluster.lng, cluster.lat],
      zoom: finalZoom,
      duration: 400
    }
    
    // Only include offset if it's non-zero (for mobile bottom sheet)
    if (offsetY !== 0) {
      flyToOptions.offset = [0, offsetY]
    }
    
    map.flyTo(flyToOptions)
    
    // Call the onClusterClick callback if provided
    pins?.onClusterClick?.(cluster)
  }, [pins, bottomSheetHeight])

  // Handle map click (not on markers/pins)
  const handleMapClick = useCallback((e: any) => {
    // Only trigger onMapClick if clicking directly on the map canvas (not on markers/pins)
    // Markers and pins have data attributes that we can check for
    // Check if originalEvent exists (may be undefined in test environments)
    if (!e?.originalEvent || !e.originalEvent?.target) {
      // If we can't determine the target, call onMapClick as fallback
      if (onMapClick) {
        onMapClick()
      }
      return
    }
    
    const target = e.originalEvent.target as HTMLElement
    const isClickOnMarker = target.closest('[data-cluster-marker="true"], [data-location-marker="true"], [data-pin-marker="true"], [data-testid="cluster"], [data-testid="location-marker"]')
    
    if (!isClickOnMarker && onMapClick) {
      onMapClick()
    }
  }, [onMapClick])

  // First-click-to-center, second-click-to-select for location pins
  const centeredLocationRef = useRef<Record<string, boolean>>({})
  const previousSelectedIdRef = useRef<string | null>(null)
  // Track when we're programmatically centering to prevent clearing selection during animation
  const isCenteringToPinRef = useRef<{ locationId: string; lat: number; lng: number } | null>(null)
  // Track ongoing animation to cancel it if a new one starts (prevents label flashing)
  const ongoingAnimationRef = useRef<{ cancel: () => void } | null>(null)
  // Track when user is actively dragging/interacting with the map
  const isUserDraggingRef = useRef<boolean>(false)
  
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
    
    // First click: center the map AND show callout immediately
    if (!alreadyCentered && mapRef.current?.getMap) {
      const map = mapRef.current.getMap()
      if (map && typeof lat === 'number' && typeof lng === 'number') {
        // Stop any ongoing animations immediately to prevent label flashing
        try {
          map.stop()
        } catch (e) {
          // Ignore errors if stop fails
        }
        
        // Cancel any tracked animation
        if (ongoingAnimationRef.current) {
          try {
            ongoingAnimationRef.current.cancel()
          } catch (e) {
            // Ignore errors if cancel fails
          }
          ongoingAnimationRef.current = null
        }
        
        // Mark that we're centering to this pin
        isCenteringToPinRef.current = { locationId, lat, lng }
        
        // Notify parent that centering has started
        onCenteringStart?.(locationId, lat, lng)
        
        // Always use jumpTo for pin clicks to prevent label fading
        // jumpTo is instant with no animation, so labels don't fade
        const jumpOptions: any = {
          center: [lng, lat]
        }
        
        // Only add offset if bottomSheetHeight is set (mobile)
        if (bottomSheetHeight > 0) {
          // For jumpTo, we need to manually adjust the center to account for offset
          // Calculate the offset in lat/lng degrees
          const mapBounds = map.getBounds()
          const mapHeight = mapBounds.getNorth() - mapBounds.getSouth()
          const offsetLat = (bottomSheetHeight / 2) * (mapHeight / map.getContainer().offsetHeight)
          jumpOptions.center = [lng, lat + offsetLat]
        }
        
        map.jumpTo(jumpOptions)
        
        // Clear flags immediately since there's no animation
        isCenteringToPinRef.current = null
        onCenteringEnd?.()
        
        centeredLocationRef.current[locationId] = true
        
        // Show callout immediately on first click (even while centering)
        hybridPins?.onLocationClick?.(locationId)
        return
      }
    }
    
    // Second click (or if we couldn't center): select location
    hybridPins?.onLocationClick?.(locationId)
  }, [hybridPins?.onLocationClick, hybridPins?.selectedId, bottomSheetHeight, skipCenteringOnClick, onCenteringStart, onCenteringEnd])
  
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

  // Handle center/zoom changes (reactive updates from props)
  // Skip center/zoom updates when fitBounds is active to prevent zoom flash
  // Also skip when we're programmatically centering to a pin (to avoid conflicts)
  // Also skip when user is actively dragging/interacting with the map
  // 
  // NOTE: These guards only apply to reactive prop-based updates.
  // Imperative map movements (map.easeTo/map.flyTo called directly) bypass this useEffect
  // and are not affected by these guards. This allows user-initiated recentering to work
  // even when guards would normally block reactive updates.
  useEffect(() => {
    if (!loaded || !mapRef.current || fitBounds) return
    
    // Don't easeTo if we're currently centering to a pin (programmatic centering)
    if (isCenteringToPinRef.current) return
    
    // Don't easeTo if user is actively dragging the map
    if (isUserDraggingRef.current) return
    
    const map = mapRef.current.getMap()
    if (!map) return

    const currentCenter = map.getCenter()
    const currentZoom = map.getZoom()
    
    const latDiff = Math.abs(currentCenter.lat - center.lat)
    const lngDiff = Math.abs(currentCenter.lng - center.lng)
    const zoomDiff = Math.abs(currentZoom - zoom)
    
    if (latDiff > 1e-5 || lngDiff > 1e-5 || zoomDiff > 0.01) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[MAP] easeTo:', { center, zoom })
      }
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
        preserveDrawingBuffer={true}
        onLoad={onLoad}
        onStyleData={onStyleData}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        onError={(error: any) => {
          console.error('[SIMPLE_MAP] Map error:', error)
          
          // Extract more details from the error
          const errorMessage = error?.message || error?.error?.message || String(error) || ''
          const errorType = error?.type || error?.error?.type || 'unknown'
          
          // Check if it's a token-related error
          const isTokenError = !token || token.length === 0 || 
                               errorMessage?.toLowerCase().includes('token') ||
                               errorMessage?.toLowerCase().includes('unauthorized') ||
                               errorMessage?.toLowerCase().includes('401') ||
                               errorType === 'StyleLoadError'
          
          // Provide more specific error message
          let userMessage = 'Unable to load map. Please check your connection and try again.'
          if (isTokenError) {
            userMessage = 'Map configuration error. Please contact support if this persists.'
          } else if (errorMessage?.includes('network') || errorMessage?.includes('connection') || errorMessage?.includes('ERR_CONNECTION')) {
            userMessage = 'Network error. Please check your internet connection and try again.'
          }
          
          setMapError(userMessage)
          
          // Always log detailed error info in console for debugging
          console.error('[SIMPLE_MAP] Detailed error info:', {
            error,
            errorMessage,
            errorType,
            hasToken: !!token,
            tokenLength: token?.length || 0,
            tokenPrefix: token?.substring(0, 15) + '...' || 'none',
            isTokenError
          })
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
        <div className="absolute top-2 right-2 z-40 bg-black bg-opacity-75 text-white text-xs p-2 rounded pointer-events-none">
          <div>Container: {containerRef.current?.offsetWidth}×{containerRef.current?.offsetHeight}</div>
          <div>Loaded: {loaded ? 'Yes' : 'No'}</div>
          <div>Clustering: {hybridPins ? 'Enabled (Hybrid)' : isClusteringEnabled ? 'Enabled' : 'Disabled'}</div>
          <div>Pins: {hybridPins ? hybridPins.sales.length : pins ? pins.sales.length : sales.length}</div>
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