'use client'

import { useEffect, useState, useRef } from 'react'
import Map, { Marker, Popup } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
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
  onViewChange?: (args: { center: { lat: number; lng: number }, zoom: number }) => void
  centerOverride?: { lat: number; lng: number; zoom?: number } | null
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
  centerOverride
}: SalesMapProps) {
  useEffect(() => {
    incMapLoad()
  }, [])
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const mapRef = useRef<any>(null)
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
          const targetZoom = centerOverride.zoom || Math.max(map.getZoom(), 11)
          map.easeTo({ 
            center: [centerOverride.lng, centerOverride.lat], 
            zoom: targetZoom, 
            duration: 500 
          })
        }
      } catch {}
    }
  }, [centerOverride])

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
    if (onViewChange) {
      onViewChange({ center: { lat: evt.viewState.latitude, lng: evt.viewState.longitude }, zoom: evt.viewState.zoom })
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
    }, 800) // trailing debounce 800ms
  }

  const handleMoveEnd = () => {
    setMoved(true)
    scheduleAutoSearch()
  }

  const handleZoomEnd = () => {
    setMoved(true)
    scheduleAutoSearch()
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
    <div className="h-96 w-full rounded-lg overflow-hidden">
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
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            latitude={marker.lat}
            longitude={marker.lng}
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
        ))}

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
