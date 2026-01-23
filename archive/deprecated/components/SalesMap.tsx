/** @deprecated Replaced by components/location/SimpleMap.tsx. Not loaded by the app. */
// DEPRECATED: replaced by SimpleMap
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Map, { Marker, Popup } from 'react-map-gl'
// import mapboxgl from 'mapbox-gl'
import { Sale } from '@/lib/types'
// import { formatLocation } from '@/lib/location/client'
import { getMapboxToken } from '@/lib/maps/token'
import { incMapLoad } from '@/lib/usageLogs'
import { isClusteringEnabled } from '@/lib/clustering'
// DEPRECATED: SalesMapClustered removed - use SimpleMap with pins prop instead
import SimpleMap from './SimpleMap'
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
  onMapReady,
}: SalesMapProps) {
  // All hooks must be called unconditionally at the top
  useEffect(() => {
    incMapLoad()
  }, [])

  // Call onMapReady when map loads (not onLoad bounds emission)
  const handleMapLoad = useCallback((event: any) => {
    console.log('[MAP] handleMapLoad called - map is ready!', { event })
    mapDebug.logMapLoad('SalesMap', 'success', { onMapReady: !!onMapReady })
    setIsMapLoading(false) // Map is loaded, hide loading indicator
    
    // Store the map instance directly from the event
    const map = event.target
    mapInstanceRef.current = map
    console.log('[MAP] Map loaded:', { mapExists: !!map, mapType: typeof map, instanceStored: !!mapInstanceRef.current })
    
    if (map && typeof map.resize === 'function') {
      // Resize immediately on load
      map.resize()
      
      // Also resize after style loads (important for proper rendering)
      map.on('style.load', () => {
        map.resize()
        if (process.env.NEXT_PUBLIC_DEBUG === 'true' || window.location.search.includes('debug=1')) {
          console.log(`[MAP_RESIZE] invoked reason=style.load`)
        }
      })
      
      // One-shot resize after first frame
      requestAnimationFrame(() => {
        map.resize()
        if (process.env.NEXT_PUBLIC_DEBUG === 'true' || window.location.search.includes('debug=1')) {
          console.log(`[MAP_RESIZE] invoked reason=requestAnimationFrame`)
        }
      })
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true' || window.location.search.includes('debug=1')) {
        console.log(`[MAP_RESIZE] invoked reason=load`)
      }
    }
    
    // Handle any pending center changes that were queued before map was ready
    if (pendingCenterChangeRef.current) {
      console.log('[MAP] Map loaded, applying pending center change:', pendingCenterChangeRef.current)
      // Apply the pending center change by updating the map view
      const { center: pendingCenter, zoom: pendingZoom } = pendingCenterChangeRef.current
      map.easeTo({ 
        center: [pendingCenter.lng, pendingCenter.lat], 
        zoom: pendingZoom, 
        duration: 600 
      })
      pendingCenterChangeRef.current = null
    } else {
      console.log('[MAP] Map loaded, no pending center changes')
    }
    
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
  
  // Debug state for container sizing
  const [debugInfo, setDebugInfo] = useState({
    containerWidth: 0,
    containerHeight: 0,
    parentWidth: 0,
    parentHeight: 0,
    lastResize: 0
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const autoFitAttemptedRef = useRef(false)
  const pendingCenterChangeRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null)
  const [isMapLoading, setIsMapLoading] = useState(true)
  
  // Map refs for component lifecycle
  
  // ResizeObserver for map container sizing
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const parent = entry.target.parentElement
        const parentRect = parent?.getBoundingClientRect()
        
        const newDebugInfo = {
          containerWidth: Math.round(width),
          containerHeight: Math.round(height),
          parentWidth: parentRect ? Math.round(parentRect.width) : 0,
          parentHeight: parentRect ? Math.round(parentRect.height) : 0,
          lastResize: Date.now()
        }
        
        setDebugInfo(newDebugInfo)
        
        // Log resize event
        if (process.env.NEXT_PUBLIC_DEBUG === 'true' || window.location.search.includes('debug=1')) {
          console.log(`[MAP_RESIZE] invoked reason=observer size=${newDebugInfo.containerWidth}x${newDebugInfo.containerHeight}`)
          console.log(`[MAP_VIS] container=${newDebugInfo.containerWidth}x${newDebugInfo.containerHeight} parent=${newDebugInfo.parentWidth}x${newDebugInfo.parentHeight}`)
        }
        
        // Call map.resize() if map is available
        const map = mapRef.current?.getMap?.()
        if (map && typeof map.resize === 'function') {
          map.resize()
          
          // One-shot resize after first observer event
          if (newDebugInfo.containerHeight > 0 && !autoFitAttemptedRef.current) {
            autoFitAttemptedRef.current = true
            requestAnimationFrame(() => {
              map.resize()
              if (process.env.NEXT_PUBLIC_DEBUG === 'true' || window.location.search.includes('debug=1')) {
                console.log(`[MAP_RESIZE] invoked reason=first-observer-frame`)
              }
            })
          }
        }
      }
    })

    resizeObserver.observe(containerRef.current)
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

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
          // Allow AUTO-FIT for all cases
          
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

  // Update view state when center changes (animate transitions)
  useEffect(() => {
    setViewState(prev => ({ ...prev, latitude: center.lat, longitude: center.lng }))
    // Smoothly ease to the new center without remounting or routing
    try {
      const map = mapRef.current?.getMap?.()
      if (map) {
        // Allow programmatic movement
        
        const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : (zoom || 11)
        // Do not force a minimum zoom during programmatic recenters; respect current zoom
        map.easeTo({ center: [center.lng, center.lat], zoom: currentZoom, duration: 600 })
      }
    } catch {}
  }, [center.lat, center.lng])

  // Simple map load handling - no complex state management needed
  useEffect(() => {
    mapDebug.logMapLoad('SalesMap', 'start')
  }, [])

  // Handle center override
  useEffect(() => {
    if (!centerOverride) return
    
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Allow programmatic movement
      
      const targetZoom = centerOverride.zoom || zoom
      map.easeTo({ 
        center: [centerOverride.lng, centerOverride.lat], 
        zoom: targetZoom, 
        duration: 600 
      })
    } catch {}
  }, [centerOverride, zoom])

  // Store map instance from onLoad callback
  const mapInstanceRef = useRef<any>(null)

  // Handle center changes
  useEffect(() => {
    console.log('[MAP] Center effect triggered', { center })
    
    if (!mapInstanceRef.current) {
      console.log('[MAP] Center effect - no map instance, returning')
      return
    }

    const map = mapInstanceRef.current
    const currentCenter = map.getCenter()
    const newCenter = { lat: center.lat, lng: center.lng }
    
    console.log('[MAP] Current center:', currentCenter, 'New center:', newCenter)
    
    // Check if center has changed significantly
    const latDiff = Math.abs(currentCenter.lat - newCenter.lat)
    const lngDiff = Math.abs(currentCenter.lng - newCenter.lng)
    
    if (latDiff > 0.001 || lngDiff > 0.001) {
      console.log('[MAP] Moving map to new center:', newCenter)
      map.easeTo({
        center: [newCenter.lng, newCenter.lat],
        duration: 1000
      })
    } else {
      console.log('[MAP] Center unchanged, no movement needed')
    }
  }, [center.lat, center.lng])

  // Handle fit bounds
  useEffect(() => {
    if (!fitBounds) return
    
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Allow fitBounds for all cases
      
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
    <div ref={containerRef} className="relative min-h-0 min-w-0 w-full h-full">
      {isMapLoading && <MapLoadingIndicator />}
      
      {/* Debug overlay */}
      {(process.env.NEXT_PUBLIC_DEBUG === 'true' || window.location.search.includes('debug=1')) && (
        <div className="absolute top-2 left-2 z-50 bg-black bg-opacity-75 text-white text-xs p-2 rounded pointer-events-none">
          <div>Container: {debugInfo.containerWidth}×{debugInfo.containerHeight}</div>
          <div>Parent: {debugInfo.parentWidth}×{debugInfo.parentHeight}</div>
          <div>Last resize: {new Date(debugInfo.lastResize).toLocaleTimeString()}</div>
        </div>
      )}
      
      <Map
        ref={mapRef}
        mapboxAccessToken={getMapboxToken()}
        initialViewState={{
          longitude: center.lng,
          latitude: center.lat,
          zoom: zoom
        }}
        key={`${center.lat}-${center.lng}-${zoom}`}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onLoad={handleMapLoad}
        onMoveEnd={handleMoveEnd}
        onZoomEnd={handleZoomEnd}
        onMove={handleViewChange}
        onError={(error: any) => console.log('[MAP] Map error:', error)}
        onStyleLoad={() => console.log('[MAP] Style loaded')}
        onStyleData={() => console.log('[MAP] Style data loaded')}
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