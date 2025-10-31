'use client'

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react"
import Map, { Popup } from "react-map-gl"
import { getMapboxToken } from "@/lib/maps/token"
import { Sale } from "@/lib/types"
import { PinsProps, HybridPinsProps } from "@/lib/pins/types"
import PinsOverlay from "./PinsOverlay"
import HybridPinsOverlay from "./HybridPinsOverlay"

interface SimpleMapProps {
  center: { lat: number; lng: number }
  zoom?: number
  fitBounds?: { west: number; south: number; east: number; north: number } | null
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
}

const SimpleMap = forwardRef<any, SimpleMapProps>(({ 
  center, 
  zoom = 11, 
  fitBounds, 
  sales = [],
  onSaleClick,
  selectedSaleId,
  pins,
  hybridPins,
  onViewportChange,
  isTransitioning = false,
  transitionMessage = "Loading...",
  interactive = true
}, ref) => {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loaded, setLoaded] = useState(false)
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
  
  // Check if clustering is enabled - FORCE DISABLED to prevent blue circles
  const isClusteringEnabled = false  // Disabled to prevent blue cluster markers

  // Expose the map instance to parent components
  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current?.getMap?.(),
    isLoaded: () => loaded
  }), [loaded])

  const onLoad = useCallback(() => {
    console.log('[MAP] onLoad - Map initialization completed')
    setLoaded(true)
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
        
        console.log('[MAP] onLoad - Initial viewport:', viewport)
        console.log('[MAP] onLoad - Bounds range:', {
          latRange: viewport.bounds.north - viewport.bounds.south,
          lngRange: viewport.bounds.east - viewport.bounds.west,
          center: viewport.center,
          zoom: viewport.zoom
        })
        console.log('[MAP] onLoad - Bounds area (square degrees):', (viewport.bounds.north - viewport.bounds.south) * (viewport.bounds.east - viewport.bounds.west))
        onViewportChange?.(viewport)
      }
    }
  }, [onViewportChange])

  const onStyleData = useCallback(() => {
    console.log('[MAP] onStyleData')
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
    
    console.log('[MAP] onMoveEnd:', viewport)
    console.log('[MAP] onMoveEnd - Bounds range:', {
      latRange: viewport.bounds.north - viewport.bounds.south,
      lngRange: viewport.bounds.east - viewport.bounds.west,
      center: viewport.center
    })
    onViewportChange?.(viewport)
  }, [onViewportChange])

  // Handle cluster click
  const handleClusterClick = useCallback((cluster: any) => {
    if (!mapRef.current) return
    
    const map = mapRef.current.getMap()
    if (!map) return

    console.log('[CLUSTER] expand', { lat: cluster.lat, lng: cluster.lng, expandToZoom: cluster.expandToZoom })
    
    // TEMPORARILY DISABLED: Zoom functionality works but is disabled for UX testing
    // Original zoom behavior (commented out):
    // map.flyTo({
    //   center: [cluster.lng, cluster.lat],
    //   zoom: cluster.expandToZoom,
    //   duration: 400
    // })
    
    // TEMPORARY: Just center the map on the cluster without zooming
    map.flyTo({
      center: [cluster.lng, cluster.lat],
      duration: 400
    })
    
    // Call the onClusterClick callback if provided
    pins?.onClusterClick?.(cluster)
  }, [pins])

  // First-click-to-center, second-click-to-select for location pins
  const centeredLocationRef = useRef<Record<string, boolean>>({})
  const handleLocationClickWrapped = useCallback((locationId: string, lat?: number, lng?: number) => {
    const alreadyCentered = centeredLocationRef.current[locationId]
    if (!alreadyCentered && mapRef.current?.getMap) {
      const map = mapRef.current.getMap()
      if (map && typeof lat === 'number' && typeof lng === 'number') {
        map.flyTo({ center: [lng, lat], duration: 400 })
        centeredLocationRef.current[locationId] = true
        return
      }
    }
    // Second click (or if we couldn't center): bubble to parent to select location
    hybridPins?.onLocationClick?.(locationId)
  }, [hybridPins])

  // Handle fitBounds
  useEffect(() => {
    if (!loaded || !mapRef.current || !fitBounds) return
    
    const boundsKey = `${fitBounds.west}|${fitBounds.south}|${fitBounds.east}|${fitBounds.north}`
    
    if (boundsKey !== lastBoundsKey.current) {
      console.log('[MAP] fitBounds:', fitBounds)
      const map = mapRef.current.getMap()
      if (map) {
        map.fitBounds(
          [[fitBounds.west, fitBounds.south], [fitBounds.east, fitBounds.north]], 
          { padding: 40, duration: 600 }
        )
        lastBoundsKey.current = boundsKey
      }
    }
  }, [fitBounds, loaded])

  // Handle center/zoom changes
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
    <div ref={containerRef} className="relative min-h-0 min-w-0 w-full h-full">
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
      
      {/* Loading overlay for smooth transitions */}
      {isTransitioning && (
        <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white rounded-lg shadow-lg p-4 flex items-center space-x-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
            <span className="text-gray-700 font-medium">{transitionMessage}</span>
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
    </div>
  )
})

SimpleMap.displayName = 'SimpleMap'

export default SimpleMap