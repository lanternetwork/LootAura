'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Map, { Marker, Popup } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import mapboxgl from 'mapbox-gl'
import { Sale } from '@/lib/types'
import { formatLocation } from '@/lib/location/client'
import { getMapboxToken } from '@/lib/maps/token'
import { incMapLoad } from '@/lib/usageLogs'

interface SalesMapProps {
  sales: Sale[]
  markers?: {id: string; title: string; lat: number; lng: number}[]
  center?: { lat: number; lng: number }
  zoom?: number
  onSaleClick?: (sale: Sale) => void
  selectedSaleId?: string
  onSearchArea?: (args: { bounds: { north: number; south: number; east: number; west: number }, center: { lat: number; lng: number }, zoom: number }) => void
  onViewChange?: (args: { center: { lat: number; lng: number }, zoom: number, userInteraction: boolean }) => void
  centerOverride?: { lat: number; lng: number; zoom?: number } | null
  fitBounds?: { north: number; south: number; east: number; west: number } | null
  onFitBoundsComplete?: () => void
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number; ts: number } | undefined) => void
  onVisiblePinsChange?: (visibleIds: string[], count: number) => void
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
  onVisiblePinsChange
}: SalesMapProps) {
  useEffect(() => {
    incMapLoad()
  }, [])
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const mapRef = useRef<any>(null)
  const fitTokenRef = useRef<string | null>(null)
  const suppressEmitsRef = useRef(false)
  const [viewState, setViewState] = useState({
    latitude: center.lat,
    longitude: center.lng,
    zoom: zoom
  })
  const [moved, setMoved] = useState(false)
  const [visiblePinIds, setVisiblePinIds] = useState<string[]>([])
  const [visiblePinCount, setVisiblePinCount] = useState(0)
  
  useEffect(() => {
    console.log('[MAP] initialized with', sales.length, 'sales')
  }, [])

  // Recompute visible pins when markers change
  useEffect(() => {
    console.log('[MARKERS] set:', markers.length)
    // Wait for map to be idle before recomputing
    const map = mapRef.current?.getMap?.()
    if (map) {
      const handleIdle = () => {
        recomputeVisiblePins('markers-updated')
        
        // Auto-fit if no pins are visible but markers exist
        if (markers.length > 0 && visiblePinCount === 0) {
          console.log('[AUTO-FIT] No visible pins but markers exist, fitting to bounds')
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
        const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : (zoom || 11)
        // Do not force a minimum zoom during programmatic recenters; respect current zoom
        map.easeTo({ center: [center.lng, center.lat], zoom: currentZoom, duration: 600 })
      }
    } catch {}
  }, [center.lat, center.lng])

  // Emit bounds once when map is ready (onLoad)
  useEffect(() => {
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      const handleLoad = () => {
        const b = getBounds()
        if (b) {
          console.log('[MAP][EMIT] onLoad bounds', { west: b.west, south: b.south, east: b.east, north: b.north })
          if (onBoundsChange) onBoundsChange(b)
        }
      }
      if (map.loaded?.()) {
        handleLoad()
      } else {
        map.once?.('load', handleLoad)
      }
    } catch {}
  }, [onBoundsChange])

  // Handle centerOverride for ZIP input smooth recentering
  useEffect(() => {
    if (centerOverride) {
      try {
        const map = mapRef.current?.getMap?.()
        if (map) {
          const currentZoom = map.getZoom()
          const targetZoom = centerOverride.zoom || Math.max(currentZoom, 12)
          map.easeTo({ 
            center: [centerOverride.lng, centerOverride.lat], 
            zoom: targetZoom, 
            duration: 500 
          })
          setTimeout(() => {
            if (onBoundsChange) {
              const b = getBounds()
              onBoundsChange(b)
            }
          }, 550)
        }
      } catch {}
    }
  }, [centerOverride])

  // Handle fitBounds for distance changes
  useEffect(() => {
    if (fitBounds) {
      
      // Generate token and suppress emits
      const token = `${Date.now()}-${Math.random()}`
      fitTokenRef.current = token
      suppressEmitsRef.current = true
      
      try {
        const map = mapRef.current?.getMap?.()
        if (map) {
          const bounds = [
            [fitBounds.west, fitBounds.south],
            [fitBounds.east, fitBounds.north]
          ]
          map.fitBounds(bounds, { 
            padding: 20, 
            duration: 600 
          })
          
          // Attach one-time idle listener
          const handleIdle = () => {
            if (fitTokenRef.current !== token) return // stale
            fitTokenRef.current = null
            suppressEmitsRef.current = false
            if (onFitBoundsComplete) {
              onFitBoundsComplete()
            }
            if (onBoundsChange) {
              const b = getBounds()
              onBoundsChange(b)
            }
            map.off('idle', handleIdle)
          }
          map.on('idle', handleIdle)
        }
      } catch (error) {
        console.error('[MAP] fitBounds error:', error)
        // Reset on error
        fitTokenRef.current = null
        suppressEmitsRef.current = false
      }
    }
  }, [fitBounds, onFitBoundsComplete, onBoundsChange])

  useEffect(() => {
    console.log('[MAP] sales updated:', sales.length)
  }, [sales])

  useEffect(() => {
    console.log('[MAP] markers updated:', markers.length)
  }, [markers])

  const handleMarkerClick = (marker: {id: string; title: string; lat: number; lng: number}) => {
    // Find matching sale in the sales list if available
    const matchingSale = sales.find(s => s.id === marker.id)
    if (matchingSale) {
      setSelectedSale(matchingSale)
      if (onSaleClick) {
        onSaleClick(matchingSale)
      }
    } else {
      // If sale not loaded, just pan to the marker
      try {
        const map = mapRef.current?.getMap?.()
        if (map) {
          map.easeTo({ center: [marker.lng, marker.lat], zoom: Math.max(map.getZoom(), 14), duration: 500 })
        }
      } catch {}
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  // Token via util for flexibility
  const token = getMapboxToken()
  if (!token) {
    return (
      <div className="h-96 bg-gray-200 rounded-lg flex items-center justify-center">
        <p className="text-gray-600">Mapbox token missing. Set NEXT_PUBLIC_MAPBOX_TOKEN in Vercel for this environment.</p>
      </div>
    )
  }

  const handleMove = (evt: any) => {
    setViewState(evt.viewState)
    setMoved(true)
    
    if (suppressEmitsRef.current) {
      return
    }
    
    // Only emit view change on move end, not during continuous movement
    // This prevents excessive refetches during pan/zoom
  }

  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const scheduleAutoSearch = () => {
    if (!onSearchArea) return
    const map = mapRef.current?.getMap?.()
    try {
      if (map && (map.isMoving?.() || map.isDragging?.())) return
    } catch {}
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      handleSearchArea()
    }, 700) // trailing debounce 700ms
  }

  const handleMoveEnd = (evt: any) => {
    setMoved(true)
    scheduleAutoSearch()
    
    if (suppressEmitsRef.current) {
      return
    }
    
    // Emit view change on move end (debounced)
    if (onViewChange) {
      const userInteraction = !!(evt && (evt as any).originalEvent)
      onViewChange({ 
        center: { lat: evt.viewState.latitude, lng: evt.viewState.longitude }, 
        zoom: evt.viewState.zoom, 
        userInteraction 
      })
    }
    
    // Emit bounds change on move end (debounced)
    if (onBoundsChange) {
      const b = getBounds()
      if (b) console.log('[MAP][EMIT] onMoveEnd bounds', { west: b.west, south: b.south, east: b.east, north: b.north })
      onBoundsChange(b)
    }
    
    // Recompute visible pins after move ends
    recomputeVisiblePins('move-end')
  }

  const handleZoomEnd = (evt: any) => {
    setMoved(true)
    scheduleAutoSearch()
    
    if (suppressEmitsRef.current) {
      return
    }
    
    // Emit view change on zoom end (debounced)
    if (onViewChange) {
      const userInteraction = !!(evt && (evt as any).originalEvent)
      onViewChange({ 
        center: { lat: evt.viewState.latitude, lng: evt.viewState.longitude }, 
        zoom: evt.viewState.zoom, 
        userInteraction 
      })
    }
    
    // Emit bounds change on zoom end (debounced)
    if (onBoundsChange) {
      const b = getBounds()
      if (b) console.log('[MAP][EMIT] onZoomEnd bounds', { west: b.west, south: b.south, east: b.east, north: b.north })
      onBoundsChange(b)
    }
    
    // Recompute visible pins after zoom ends
    recomputeVisiblePins('zoom-end')
  }

  const getBounds = () => {
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return undefined
      const b = map.getBounds()
      const ts = Date.now()
      return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest(), ts }
    } catch {
      return undefined
    }
  }

  const recomputeVisiblePins = useCallback((reason: string) => {
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Query all rendered features in the viewport
      const features = map.queryRenderedFeatures()
      
      // Filter for unclustered marker features only
      const markerFeatures = features.filter((feature: any) => 
        feature.source === 'markers' || 
        feature.layer?.id?.includes('marker') ||
        feature.properties?.id // Assuming markers have an id property
      )
      
      // Extract IDs from visible markers
      const visibleIds = markerFeatures
        .map((feature: any) => feature.properties?.id)
        .filter((id: any) => id) // Remove undefined/null IDs
        .filter((id: string, index: number, arr: string[]) => arr.indexOf(id) === index) // Deduplicate
      
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
  }, [])

  const queryVisiblePins = () => {
    return visiblePinCount
  }

  const handleSearchArea = () => {
    const map = mapRef.current?.getMap?.()
    let centerNow = { lat: viewState.latitude, lng: viewState.longitude }
    try {
      if (map) {
        const c = map.getCenter()
        centerNow = { lat: c.lat, lng: c.lng }
      }
    } catch {}
    const bounds = getBounds()
    if (onSearchArea) {
      onSearchArea({ bounds: bounds || { north: 0, south: 0, east: 0, west: 0 }, center: centerNow, zoom: viewState.zoom })
    }
    setMoved(false)
  }

  return (
    <div className="h-96 w-full rounded-lg overflow-hidden relative">
      {/* Visible pins count based on queryRenderedFeatures */}
      <div className="absolute top-2 left-2 z-10 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
        {visiblePinCount} pins
      </div>
      <Map
        mapboxAccessToken={token}
        initialViewState={viewState}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd as any}
        onZoomEnd={handleZoomEnd as any}
        ref={mapRef}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      >
        {markers.map((marker) => {
          const lat = +marker.lat
          const lng = +marker.lng
          if (Number.isNaN(lat) || Number.isNaN(lng)) return null
          return (
            <Marker
              key={marker.id}
              latitude={lat}
              longitude={lng}
              onClick={() => handleMarkerClick(marker)}
            >
            <div className={`cursor-pointer ${
              selectedSaleId === marker.id ? 'scale-125' : 'scale-100'
            } transition-transform duration-200`}>
              <div className={`w-3 h-3 rounded-full border border-white shadow-sm ${
                'bg-blue-500'
              }`}>
              </div>
            </div>
          </Marker>
          )
        })}

        {selectedSale && (
          <Popup
            latitude={selectedSale.lat || 0}
            longitude={selectedSale.lng || 0}
            onClose={() => setSelectedSale(null)}
            closeButton={true}
            closeOnClick={false}
            anchor="bottom"
          >
            <div className="p-2 max-w-xs">
              <h3 className="font-bold text-lg mb-2">{selectedSale.title}</h3>
              
              <div className="space-y-1 text-sm">
                <p className="text-gray-600">
                  📍 {selectedSale.city}, {selectedSale.state}
                </p>
                
                <p className="text-gray-600">
                  📅 {formatDate(selectedSale.date_start)} at {formatTime(selectedSale.time_start)}
                </p>
                
                {selectedSale.price !== null && selectedSale.price !== undefined && (
                  <p className="text-green-600 font-semibold">
                    💰 {selectedSale.price === 0 ? 'Free' : `$${selectedSale.price}`}
                  </p>
                )}
                
                {selectedSale.tags && selectedSale.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedSale.tags.slice(0, 3).map((tag, index) => (
                      <span 
                        key={index}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                    {selectedSale.tags.length > 3 && (
                      <span className="text-xs text-gray-500">
                        +{selectedSale.tags.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="mt-3 pt-2 border-t">
                <a
                  href={`/sales/${selectedSale.id}`}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View Details →
                </a>
              </div>
            </div>
          </Popup>
        )}
      </Map>
      {/* Auto-search enabled; manual button removed to avoid duplicates */}
    </div>
  )
}
