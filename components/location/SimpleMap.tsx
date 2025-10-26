'use client'

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react"
import Map, { Marker, Popup } from "react-map-gl"
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
  onViewportChange 
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
  
  // Check if clustering is enabled
  const isClusteringEnabled = process.env.NEXT_PUBLIC_FEATURE_CLUSTERING !== 'false'

  // Expose the map instance to parent components
  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current?.getMap?.(),
    isLoaded: () => loaded
  }), [loaded])

  const onLoad = useCallback(() => {
    console.log('[MAP] onLoad - Map initialization completed')
    setLoaded(true)
    mapRef.current?.getMap()?.resize()
  }, [])

  const onStyleData = useCallback(() => {
    console.log('[MAP] onStyleData')
    mapRef.current?.getMap()?.resize()
  }, [])

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
    onViewportChange?.(viewport)
  }, [onViewportChange])

  // Handle cluster click
  const handleClusterClick = useCallback((cluster: any) => {
    if (!mapRef.current) return
    
    const map = mapRef.current.getMap()
    if (!map) return

    console.log('[CLUSTER] expand', { lat: cluster.lat, lng: cluster.lng, expandToZoom: cluster.expandToZoom })
    
    map.flyTo({
      center: [cluster.lng, cluster.lat],
      zoom: cluster.expandToZoom,
      duration: 400
    })
    
    // Call the onClusterClick callback if provided
    pins?.onClusterClick?.(cluster)
  }, [pins])

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
      >
        {/* Render hybrid pins if provided, otherwise fall back to regular pins or sales */}
        {hybridPins ? (
          <HybridPinsOverlay
            sales={hybridPins.sales}
            selectedId={hybridPins.selectedId}
            onLocationClick={hybridPins.onLocationClick}
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
          /* Fallback to legacy sales rendering */
          sales
            .filter(sale => typeof sale.lat === 'number' && typeof sale.lng === 'number')
            .map(sale => (
              <Marker
                key={sale.id}
                longitude={sale.lng!}
                latitude={sale.lat!}
                anchor="center"
                data-testid="marker"
              >
                <div
                  className="w-3 h-3 bg-red-500 rounded-full border border-white shadow-md hover:bg-red-600"
                  style={{
                    outline: 'none',
                    boxShadow: 'none',
                    border: '1px solid white',
                    background: 'red',
                    borderRadius: '50%'
                  }}
                  onClick={() => onSaleClick?.(sale)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Sale: ${sale.title}`}
                />
              </Marker>
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