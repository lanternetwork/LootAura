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
import MapLoadingIndicator from './MapLoadingIndicator'
import mapDebug from '@/lib/debug/mapDebug'

interface SalesMapProps {
  sales: Sale[]
  markers?: {id: string; title: string; lat: number; lng: number}[]
  center: { lat: number; lng: number }
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
  onClusterClick?: (sales: Sale[]) => void
  onMoveEnd?: () => void
  onZoomEnd?: () => void
  onMapReady?: () => void
  // Legacy arbiter props removed - using intent system only
}

export default function SalesMap({ 
  sales, 
  markers = [],
  center, 
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
  onClusterClick,
  onMoveEnd,
  onZoomEnd,
  onMapReady
}: SalesMapProps) {
  // All hooks must be called unconditionally at the top
  useEffect(() => {
    incMapLoad()
  }, [])

  // Call onMapReady when map loads (not onLoad bounds emission)
  const handleMapLoad = useCallback(() => {
    mapDebug.logMapLoad('SalesMap', 'success', { onMapReady: !!onMapReady })
    setIsMapLoading(false) // Map is loaded, hide loading indicator
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
  const [visiblePinIds, setVisiblePinIds] = useState<string[]>([])
  const [visiblePinCount, setVisiblePinCount] = useState(0)
  const [_moved, _setMoved] = useState(false)
  const autoFitAttemptedRef = useRef(false)
  const [isMapLoading, setIsMapLoading] = useState(true)
  
  // All remaining hooks must be called unconditionally
  useEffect(() => {
    mapDebug.logMapState('SalesMap', { 
      salesCount: sales.length, 
      markersCount: markers.length,
      center,
      zoom 
    })
  }, [sales.length, markers.length, center, zoom])

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
    mapDebug.log('Markers updated', { count: markers.length })
    // Recompute immediately when markers change
    recomputeVisiblePins('markers-updated')
    
    // Also wait for map to be idle for additional updates
    const map = mapRef.current?.getMap?.()
    if (map) {
      const handleIdle = () => {
        recomputeVisiblePins('markers-updated')
        
        // Auto-fit if no pins are visible but markers exist (only once per session)
        if (markers.length > 0 && visiblePinCount === 0 && !autoFitAttemptedRef.current) {
          // Auto-fit logic simplified - no authority checks needed
          
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
            ], { padding: 0, maxZoom: 15, duration: 0 })
          }
        }
        
        map.off('idle', handleIdle)
      }
      map.on('idle', handleIdle)
    }
  }, [markers, recomputeVisiblePins, visiblePinCount])

  // Update view state when center changes (handled by viewState prop)
  useEffect(() => {
    setViewState(prev => ({ ...prev, latitude: center.lat, longitude: center.lng }))
  }, [center.lat, center.lng])

  // Simple map load handling - no complex state management needed
  useEffect(() => {
    mapDebug.logMapLoad('SalesMap', 'start')
  }, [])

  // Handle center override (handled by viewState prop)
  useEffect(() => {
    if (centerOverride) {
      setViewState(prev => ({ 
        ...prev, 
        latitude: centerOverride.lat, 
        longitude: centerOverride.lng,
        zoom: centerOverride.zoom || zoom
      }))
    }
  }, [centerOverride, zoom])

  // Handle fit bounds
  useEffect(() => {
    if (!fitBounds) return
    
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Fit bounds allowed - no authority checks needed
      
      const bounds = [
        [fitBounds.west, fitBounds.south],
        [fitBounds.east, fitBounds.north]
      ]
      
      console.log('[MAP] fitBounds executing', { 
        reason: fitBounds.reason
      })
      
      map.fitBounds(bounds, { padding: 0, maxZoom: 15, duration: 0 })
      
      if (onFitBoundsComplete) {
        onFitBoundsComplete()
      }
    } catch (error) {
      console.error('[MAP] fitBounds error:', error)
    }
  }, [fitBounds, onFitBoundsComplete])

  // Handle view changes
  const handleViewChange = useCallback((evt: any) => {
    if (!onViewChange) return
    
    // Safely extract viewState with fallbacks
    const viewState = evt.viewState || evt
    const newCenter = viewState.center || { lat: 0, lng: 0 }
    const newZoom = viewState.zoom || 10
    
    // Precise user interaction detection - only detect actual user interactions
    const isUserInteraction = evt.isDragging || 
                              evt.isZooming || 
                              evt.originalEvent?.type === 'mousedown' || 
                              evt.originalEvent?.type === 'touchstart' ||
                              evt.originalEvent?.type === 'mouseup' ||
                              evt.originalEvent?.type === 'touchend' ||
                              evt.originalEvent?.type === 'mousemove' ||
                              evt.originalEvent?.type === 'touchmove' ||
                              evt.originalEvent?.type === 'wheel' ||
                              evt.originalEvent?.type === 'pointerdown' ||
                              evt.originalEvent?.type === 'pointerup' ||
                              evt.originalEvent?.type === 'pointermove'
    
    console.log('[MAP] handleViewChange - userInteraction:', isUserInteraction, {
      isDragging: evt.isDragging,
      isZooming: evt.isZooming,
      originalEventType: evt.originalEvent?.type,
      hasSource: !!evt.source,
      hasPointerType: !!evt.originalEvent?.pointerType
    })
    
    onViewChange({
      center: { lat: newCenter.lat, lng: newCenter.lng },
      zoom: newZoom,
      userInteraction: isUserInteraction
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
  const clusteringEnabled = isClusteringEnabled()
  console.log('[MAP] Clustering decision:', { 
    enabled: clusteringEnabled, 
    envVar: process.env.NEXT_PUBLIC_FEATURE_CLUSTERING,
    salesCount: sales.length,
    markersCount: markers.length
  })
  console.log('[MAP] Markers sample:', markers.slice(0, 3)) // Show first 3 markers
  
  if (clusteringEnabled) {
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
        onClusterClick={onClusterClick}
        onMoveEnd={onMoveEnd}
        onZoomEnd={onZoomEnd}
        onMapReady={onMapReady}
      />
    )
  }

  // Debug logging for map initialization
  mapDebug.log('SalesMap rendering')
  mapDebug.logTokenStatus(getMapboxToken())

  // Non-clustered map implementation
  return (
    <div className="w-full h-full relative">
      {isMapLoading && <MapLoadingIndicator />}
      <Map
        ref={mapRef}
        mapboxAccessToken={getMapboxToken()}
        viewState={{
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
        optimizeForTerrain={false}
        antialias={false}
        preserveDrawingBuffer={false}
        attributionControl={false}
        logoPosition="bottom-right"
        preloadResources={true}
        // Disable Mapbox events to prevent API failures
        // Reduce initial load time
        // Disable telemetry completely
        transformRequest={(url: string, _resourceType: string) => {
          // Block Mapbox telemetry/events using strict URL parsing (no substring checks)
          try {
            const u = new URL(url)
            const host = u.hostname.toLowerCase()
            const path = u.pathname.toLowerCase()

            const blockedHosts = new Set(['events.mapbox.com'])
            const isBlockedHost = blockedHosts.has(host)
            const isApiEvents = host === 'api.mapbox.com' && (path.startsWith('/events') || path.includes('/events/v2'))
            const isTelemetryOrAnalytics = (host.endsWith('.mapbox.com') || host === 'mapbox.com') && (path.includes('/telemetry') || path.includes('/analytics'))

            if (isBlockedHost || isApiEvents || isTelemetryOrAnalytics) {
              console.log('[MAP] Blocking request:', url)
              return null
            }
            return { url: u.toString() }
          } catch {
            // If URL parsing fails, pass through unchanged
            return { url }
          }
        }}
      >
        {markers.map(marker => (
          <Marker
            key={marker.id}
            longitude={marker.lng}
            latitude={marker.lat}
            anchor="center"
          >
            <button
              className="w-3 h-3 bg-red-500 rounded-full border border-white shadow-md hover:bg-red-600 focus:outline-none focus:ring-1 focus:ring-red-500"
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