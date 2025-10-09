'use client'

import { useEffect, useState, useRef } from 'react'
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
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number } | undefined) => void
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
  onBoundsChange
}: SalesMapProps) {
  useEffect(() => {
    // Disable Mapbox telemetry to prevent events.mapbox.com requests
    if (typeof window !== 'undefined') {
      // Disable telemetry by setting the environment variable before mapbox loads
      (window as any).__MAPBOX_TELEMETRY__ = false;
      // Also try the newer method if available
      if (mapboxgl && typeof (mapboxgl as any).setTelemetry === 'function') {
        (mapboxgl as any).setTelemetry(false);
      }
    }
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
  useEffect(() => {
    console.log('[MAP] init viewState:', viewState, 'center:', center, 'sales:', sales.length)
  }, [])

  // Update view state when center changes (animate transitions)
  useEffect(() => {
    console.log('[MAP] Center changed:', center)
    setViewState(prev => ({ ...prev, latitude: center.lat, longitude: center.lng }))
    // Smoothly ease to the new center without remounting or routing
    try {
      const map = mapRef.current?.getMap?.()
      if (map) {
        const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : (zoom || 11)
        map.easeTo({ center: [center.lng, center.lat], zoom: Math.max(currentZoom, 11), duration: 600 })
      }
    } catch {}
  }, [center.lat, center.lng])

  // Handle centerOverride for ZIP input smooth recentering
  useEffect(() => {
    if (centerOverride) {
      console.log('[MAP] CenterOverride:', centerOverride)
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
      console.log('[MAP] fitBounds triggered:', fitBounds)
      
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
    console.log('[MAP] sales updated, count:', sales.length, sales.map(s => ({ id: s.id, lat: s.lat, lng: s.lng })))
  }, [sales])

  useEffect(() => {
    console.log('[MAP] markers updated, count:', markers.length, markers.map(m => ({ id: m.id, lat: m.lat, lng: m.lng })))
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
      console.log('[MAP] suppress emits (programmatic fit in flight)')
      return
    }
    
    if (onViewChange) {
      const userInteraction = !!(evt && (evt as any).originalEvent)
      onViewChange({ center: { lat: evt.viewState.latitude, lng: evt.viewState.longitude }, zoom: evt.viewState.zoom, userInteraction })
    }
    if (onBoundsChange) {
      const b = getBounds()
      onBoundsChange(b)
    }
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

  const handleMoveEnd = () => {
    setMoved(true)
    scheduleAutoSearch()
    
    if (suppressEmitsRef.current) {
      console.log('[MAP] suppress emits (programmatic fit in flight)')
      return
    }
    
    if (onBoundsChange) {
      const b = getBounds()
      onBoundsChange(b)
    }
  }

  const handleZoomEnd = () => {
    setMoved(true)
    scheduleAutoSearch()
    
    if (suppressEmitsRef.current) {
      console.log('[MAP] suppress emits (programmatic fit in flight)')
      return
    }
    
    if (onBoundsChange) {
      const b = getBounds()
      onBoundsChange(b)
    }
  }

  const getBounds = () => {
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return undefined
      const b = map.getBounds()
      return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }
    } catch {
      return undefined
    }
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
      {/* TEMP overlay for pin count verification */}
      <div className="absolute top-2 left-2 z-10 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
        {markers?.length ?? 0} pins
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
