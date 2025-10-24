'use client'

import { useEffect, useRef, useState, useCallback } from "react"
import Map from "react-map-gl"
import { getMapboxToken } from "@/lib/maps/token"

interface SimpleMapProps {
  center: { lat: number; lng: number }
  zoom?: number
  fitBounds?: { west: number; south: number; east: number; north: number } | null
  onViewportChange?: (args: { 
    center: { lat: number; lng: number }; 
    zoom: number; 
    bounds: { west: number; south: number; east: number; north: number } 
  }) => void
}

export default function SimpleMap({ 
  center, 
  zoom = 11, 
  fitBounds, 
  onViewportChange 
}: SimpleMapProps) {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const lastBoundsKey = useRef<string>("")
  
  const token = getMapboxToken()

  const onLoad = useCallback(() => {
    console.log('[MAP] onLoad')
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
        console.log('[MAP_RESIZE] Container resized:', { width, height })
        
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
      />
      
      {/* Debug overlay */}
      {process.env.NEXT_PUBLIC_DEBUG === "true" && (
        <div className="absolute top-2 left-2 z-50 bg-black bg-opacity-75 text-white text-xs p-2 rounded pointer-events-none">
          <div>Container: {containerRef.current?.offsetWidth}×{containerRef.current?.offsetHeight}</div>
          <div>Loaded: {loaded ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  )
}
