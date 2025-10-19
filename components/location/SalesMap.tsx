'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Map, { Marker, Popup } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
// import mapboxgl from 'mapbox-gl'
import { Sale } from '@/lib/types'
// import { formatLocation } from '@/lib/location/client'
import { getMapboxToken } from '@/lib/maps/token'
import { incMapLoad } from '@/lib/usageLogs'
import { isClusteringEnabled } from '@/lib/clustering'
import SalesMapClustered from './SalesMapClustered'
import MapLoadingSkeleton from './MapLoadingSkeleton'

interface SalesMapProps {
  sales: Sale[]
  markers?: {id: string; title: string; lat: number; lng: number}[]
  center?: { lat: number; lng: number }
  zoom?: number
  onSaleClick?: (sale: Sale) => void
  selectedSaleId?: string
  onSearchArea?: (args: { bounds: { north: number; south: number; east: number; west: number }, center: { lat: number; lng: number }, zoom: number }) => void
  onViewChange?: (args: { center: { lat: number; lng: number }, zoom: number, userInteraction: boolean }) => void
  centerOverride?: { lat: number; lng: number; zoom?: number; reason?: string } | null
  fitBounds?: { north: number; south: number; east: number; west: number; reason?: string } | null
  onFitBoundsComplete?: () => void
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number; ts: number } | undefined) => void
  onVisiblePinsChange?: (visibleIds: string[], count: number) => void
  onMoveEnd?: () => void
  onZoomEnd?: () => void
  onMapReady?: () => void
  arbiterMode?: 'initial' | 'map' | 'zip' | 'distance'
  arbiterAuthority?: 'FILTERS' | 'MAP'
}

export default function SalesMap({ 
  sales, 
  markers = [],
  center = { lat: 38.2527, lng: -85.7585 }, 
  zoom = 10,
  onSaleClick,
  selectedSaleId,
  onSearchArea,
  onViewChange,
  centerOverride,
  fitBounds,
  onFitBoundsComplete,
  onBoundsChange,
  onVisiblePinsChange,
  onMoveEnd,
  onZoomEnd,
  onMapReady,
  arbiterMode,
  arbiterAuthority
}: SalesMapProps) {
  // All hooks must be called unconditionally at the top
  useEffect(() => {
    incMapLoad()
  }, [])

  // Call onMapReady when map loads (not onLoad bounds emission)
  const handleMapLoad = useCallback(() => {
    setMapLoaded(true)
    if (onMapReady) {
      onMapReady()
    }
  }, [onMapReady])
  const [_selectedSale, _setSelectedSale] = useState<Sale | null>(null)
  const mapRef = useRef<any>(null)
  const _fitTokenRef = useRef<string | null>(null)
  const _suppressEmitsRef = useRef(false)
  const [_viewState, setViewState] = useState({
    longitude: center.lng,
    latitude: center.lat,
    zoom: zoom
  })
  const [mapLoaded, setMapLoaded] = useState(false)
  const [visiblePinIds, setVisiblePinIds] = useState<string[]>([])
  const [visiblePinCount, setVisiblePinCount] = useState(0)
  const [_moved, _setMoved] = useState(false)
  const autoFitAttemptedRef = useRef(false)
  
  // All remaining hooks must be called unconditionally
  useEffect(() => {
    console.log('[MAP] initialized with', sales.length, 'sales')
  }, [])

  const recomputeVisiblePins = useCallback((reason: string) => {
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Get current viewport bounds
      const bounds = map.getBounds()
      const viewportBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      }
      
      // Filter markers that are within the current viewport
      const visibleMarkers = markers.filter(marker => {
        const lat = +marker.lat
        const lng = +marker.lng
        if (Number.isNaN(lat) || Number.isNaN(lng)) return false
        
        return lat >= viewportBounds.south && 
               lat <= viewportBounds.north && 
               lng >= viewportBounds.west && 
               lng <= viewportBounds.east
      })
      
      const visibleIds = visibleMarkers.map(marker => marker.id)
      
      // Circuit breaker: only update if visible pins actually changed
      const currentVisibleIds = visiblePinIds
      if (visibleIds.length === currentVisibleIds.length && 
          visibleIds.every(id => currentVisibleIds.includes(id))) {
        console.log('[VISIBLE] pins unchanged - skipping update to prevent loop')
        return
      }
      
      setVisiblePinIds(visibleIds)
      setVisiblePinCount(visibleIds.length)
      
      // Notify parent component of visible pins change
      if (onVisiblePinsChange) {
        onVisiblePinsChange(visibleIds, visibleIds.length)
      }
      
      console.log('[VISIBLE] count:', visibleIds.length, 'reason:', reason)
    } catch (error) {
      console.error('[VISIBLE] error:', error)
      setVisiblePinIds([])
      setVisiblePinCount(0)
    }
  }, [markers, onVisiblePinsChange, visiblePinIds])

  // Recompute visible pins when markers change
  useEffect(() => {
    console.log('[MARKERS] set:', markers.length)
    // Recompute immediately when markers change
    recomputeVisiblePins('markers-updated')
    
    // Also wait for map to be idle for additional updates
    const map = mapRef.current?.getMap?.()
    if (map) {
      const handleIdle = () => {
        recomputeVisiblePins('markers-updated')
        
        // Auto-fit if no pins are visible but markers exist (only once per session)
        if (markers.length > 0 && visiblePinCount === 0 && !autoFitAttemptedRef.current) {
          // Block AUTO-FIT in MAP authority mode
          if (arbiterAuthority === 'MAP') {
            console.log('[BLOCK] AUTO-FIT suppressed (mode=map)')
            return
          }
          
          // Block AUTO-FIT in FILTERS authority mode (not distance change)
          if (arbiterAuthority === 'FILTERS' && arbiterMode !== 'distance') {
            console.log('[BLOCK] AUTO-FIT suppressed (filters authoritative, not distance)')
            return
          }
          
          console.log('[AUTO-FIT] No visible pins but markers exist, fitting to bounds')
          autoFitAttemptedRef.current = true
          
          const bounds = markers.reduce((acc, marker) => {
            const lat = +marker.lat
            const lng = +marker.lng
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
              acc.north = Math.max(acc.north, lat)
              acc.south = Math.min(acc.south, lat)
              acc.east = Math.max(acc.east, lng)
              acc.west = Math.min(acc.west, lng)
            }
            return acc
          }, { north: -90, south: 90, east: -180, west: 180 })
          
          if (bounds.north > bounds.south && bounds.east > bounds.west) {
            map.fitBounds([
              [bounds.west, bounds.south],
              [bounds.east, bounds.north]
            ], { padding: 50, maxZoom: 15 })
          }
        }
        
        map.off('idle', handleIdle)
      }
      map.on('idle', handleIdle)
    }
  }, [markers, recomputeVisiblePins, visiblePinCount])

  // Update view state when center changes (animate transitions)
  useEffect(() => {
    setViewState(prev => ({ ...prev, latitude: center.lat, longitude: center.lng }))
    // Smoothly ease to the new center without remounting or routing
    try {
      const map = mapRef.current?.getMap?.()
      if (map) {
        // Block programmatic movement in MAP authority mode
        if (arbiterAuthority === 'MAP') {
          console.log('[BLOCK] programmatic move suppressed (map authoritative)')
          return
        }
        
        const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : (zoom || 11)
        // Do not force a minimum zoom during programmatic recenters; respect current zoom
        map.easeTo({ center: [center.lng, center.lat], zoom: currentZoom, duration: 600 })
      }
    } catch {}
  }, [center.lat, center.lng, arbiterAuthority])

  // Call onMapReady when map loads (no bounds emission on onLoad)
  useEffect(() => {
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      const handleLoad = () => {
        handleMapLoad()
        // Don't emit bounds on onLoad - only on idle
      }
      if (map.loaded?.()) {
        handleLoad()
      } else {
        map.once?.('load', handleLoad)
      }
    } catch {}
  }, [handleMapLoad])

  // Handle center override
  useEffect(() => {
    if (!centerOverride) return
    
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Block programmatic movement in MAP authority mode
      if (arbiterAuthority === 'MAP') {
        console.log('[BLOCK] center override suppressed (map authoritative)')
        return
      }
      
      const targetZoom = centerOverride.zoom || zoom
      map.easeTo({ 
        center: [centerOverride.lng, centerOverride.lat], 
        zoom: targetZoom, 
        duration: 600 
      })
    } catch {}
  }, [centerOverride, arbiterAuthority, zoom])

  // Handle fit bounds
  useEffect(() => {
    if (!fitBounds) return
    
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Block programmatic movement in MAP authority mode
      if (arbiterAuthority === 'MAP') {
        console.log('[BLOCK] fit bounds suppressed (map authoritative)')
        return
      }
      
      const bounds = [
        [fitBounds.west, fitBounds.south],
        [fitBounds.east, fitBounds.north]
      ]
      
      map.fitBounds(bounds, { padding: 50, maxZoom: 15 })
      
      if (onFitBoundsComplete) {
        onFitBoundsComplete()
      }
    } catch {}
  }, [fitBounds, arbiterAuthority, onFitBoundsComplete])

  // Handle view changes
  const handleViewChange = useCallback((evt: any) => {
    if (!onViewChange) return
    
    const { center: newCenter, zoom: newZoom } = evt.viewState
    onViewChange({
      center: { lat: newCenter.lat, lng: newCenter.lng },
      zoom: newZoom,
      userInteraction: evt.isDragging || evt.isZooming
    })
  }, [onViewChange])

  // Handle move end
  const handleMoveEnd = useCallback(() => {
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Get current viewport bounds
      const bounds = map.getBounds()
      const viewportBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      }
      
      // Notify parent component of bounds change
      if (onBoundsChange) {
        onBoundsChange({
          ...viewportBounds,
          ts: Date.now()
        })
      }
      
      // Recompute visible pins
      recomputeVisiblePins('move-end')
      
      if (onMoveEnd) {
        onMoveEnd()
      }
    } catch (error) {
      console.error('[MOVE] error:', error)
    }
  }, [onBoundsChange, recomputeVisiblePins, onMoveEnd])

  // Handle zoom end
  const handleZoomEnd = useCallback(() => {
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Recompute visible pins
      recomputeVisiblePins('zoom-end')
      
      if (onZoomEnd) {
        onZoomEnd()
      }
    } catch (error) {
      console.error('[ZOOM] error:', error)
    }
  }, [recomputeVisiblePins, onZoomEnd])

  // Handle search area
  const _handleSearchArea = useCallback((args: { bounds: { north: number; south: number; east: number; west: number }, center: { lat: number; lng: number }, zoom: number }) => {
    if (onSearchArea) {
      onSearchArea(args)
    }
  }, [onSearchArea])

  // Use clustering if enabled, otherwise fall back to individual markers
  if (isClusteringEnabled()) {
    return (
      <SalesMapClustered
        sales={sales}
        markers={markers}
        center={center}
        zoom={zoom}
        onSaleClick={onSaleClick}
        selectedSaleId={selectedSaleId}
        onSearchArea={onSearchArea}
        onViewChange={onViewChange}
        centerOverride={centerOverride}
        fitBounds={fitBounds}
        onFitBoundsComplete={onFitBoundsComplete}
        onBoundsChange={onBoundsChange}
        onVisiblePinsChange={onVisiblePinsChange}
        onMoveEnd={onMoveEnd}
        onZoomEnd={onZoomEnd}
        onMapReady={onMapReady}
        arbiterMode={arbiterMode}
        arbiterAuthority={arbiterAuthority}
      />
    )
  }

  // Show loading skeleton while map loads (but not in test environment)
  if (!mapLoaded && process.env.NODE_ENV !== 'test') {
    return <MapLoadingSkeleton />
  }

  // Non-clustered map implementation
  return (
    <div className="w-full h-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={getMapboxToken()}
        initialViewState={{
          longitude: center.lng,
          latitude: center.lat,
          zoom: zoom
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onLoad={handleMapLoad}
        onMoveEnd={handleMoveEnd}
        onZoomEnd={handleZoomEnd}
        onMove={handleViewChange}
        interactiveLayerIds={[]}
        // Performance optimizations
        preserveDrawingBuffer={false}
        // Reduce initial load time
        attributionControl={false}
        logoPosition="bottom-right"
      >
        {markers.map(marker => (
          <Marker
            key={marker.id}
            longitude={marker.lng}
            latitude={marker.lat}
            anchor="center"
          >
            <button
              className="w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              onClick={() => {
                const sale = sales.find(s => s.id === marker.id)
                if (sale && onSaleClick) {
                  onSaleClick(sale)
                }
              }}
              aria-label={`Sale: ${marker.title}`}
            />
          </Marker>
        ))}
        
        {/* Selected sale popup */}
        {selectedSaleId && (
          <Popup
            longitude={sales.find(s => s.id === selectedSaleId)?.lng || 0}
            latitude={sales.find(s => s.id === selectedSaleId)?.lat || 0}
            onClose={() => {}}
            closeButton={false}
          >
            <div className="p-2">
              <h3 className="font-semibold">
                {sales.find(s => s.id === selectedSaleId)?.title}
              </h3>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  )
}