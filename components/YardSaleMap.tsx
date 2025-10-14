'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import { logger } from '@/lib/log'
import { Marker } from '@/lib/types'

export default function YardSaleMap({ points }: { points: Marker[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [map, setMap] = useState<any>(null)
  const [markers, setMarkers] = useState<any[]>([])
  
  const loader = useMemo(() => 
    new Loader({ 
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, 
      libraries: ['places'],
      version: 'weekly'
    }), 
    []
  )

  // Initialize map
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      setError('Google Maps API key not configured')
      setLoading(false)
      return
    }

    loader.load().then(() => {
      if (!ref.current) return

      const mapInstance = new (window as any).google.maps.Map(ref.current, { 
        mapTypeControl: true, 
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        zoom: 10,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      })

      setMap(mapInstance)
      setLoading(false)
    }).catch(err => {
      console.error('Error loading Google Maps:', err)
      setError('Failed to load map')
      setLoading(false)
    })
  }, [loader])

  // Update markers when points change
  useEffect(() => {
    if (!map) return

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null))
    const newMarkers: any[] = []

    if (points.length === 0) {
      setMarkers([])
      return
    }

    const bounds = new (window as any).google.maps.LatLngBounds()
    
    points.forEach(point => {
      const marker = new (window as any).google.maps.Marker({ 
        position: { lat: point.lat, lng: point.lng }, 
        title: point.title, 
        map,
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
          scaledSize: new (window as any).google.maps.Size(32, 32)
        }
      })
      
      const infoWindow = new (window as any).google.maps.InfoWindow({ 
        content: `
          <div class="p-2">
            <h3 class="font-semibold text-lg">${point.title}</h3>
            <a 
              href="/sales/${point.id}" 
              class="text-amber-600 hover:text-amber-700 font-medium"
            >
              View Details →
            </a>
          </div>
        `
      })
      
      marker.addListener('click', () => {
        // Close other info windows
        markers.forEach(_m => {
          const iw = new (window as any).google.maps.InfoWindow()
          iw.close()
        })
        infoWindow.open({ map, anchor: marker })
      })
      
      newMarkers.push(marker)
      bounds.extend(marker.getPosition()!)
    })

    setMarkers(newMarkers)

    logger.info('Map markers rendered', {
      component: 'YardSaleMap',
      operation: 'render_markers',
      markerCount: newMarkers.length,
      hasBounds: !bounds.isEmpty()
    })

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds)
      // Ensure minimum zoom level
      const listener = (window as any).google.maps.event.addListener(map, 'idle', () => {
        if (map.getZoom()! > 15) map.setZoom(15)
        ;(window as any).google.maps.event.removeListener(listener)
      })
    }
  }, [map, points])

  // Add "Near Me" button
  useEffect(() => {
    if (!map || !navigator.geolocation) return

    const btn = document.createElement('button')
    btn.textContent = '📍 Near Me'
    btn.className = 'bg-white px-3 py-2 rounded shadow hover:bg-neutral-50 font-medium text-sm'
    btn.style.margin = '8px'
    map.controls[(window as any).google.maps.ControlPosition.TOP_LEFT].push(btn)
    
    btn.onclick = () => {
      btn.textContent = '📍 Locating...'
      btn.disabled = true
      
      navigator.geolocation.getCurrentPosition(
        pos => {
          const center = new (window as any).google.maps.LatLng(pos.coords.latitude, pos.coords.longitude)
          map.setCenter(center)
          map.setZoom(12)
          
          // Add user location marker
          new (window as any).google.maps.Marker({ 
            position: center, 
            map, 
            title: 'Your Location',
            icon: {
              url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              scaledSize: new (window as any).google.maps.Size(32, 32)
            }
          })
          
          btn.textContent = '📍 Near Me'
          btn.disabled = false
        },
        err => {
          console.error('Geolocation error:', err)
          alert('Unable to get your location. Please check your browser settings.')
          btn.textContent = '📍 Near Me'
          btn.disabled = false
        }
      )
    }

    return () => {
      // Cleanup button on unmount
      if (btn.parentNode) {
        btn.parentNode.removeChild(btn)
      }
    }
  }, [map])

  if (loading) {
    return (
      <div className="h-[60vh] w-full rounded-2xl bg-neutral-200 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-2"></div>
          <div className="text-neutral-600">Loading map...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-[60vh] w-full rounded-2xl bg-neutral-200 flex items-center justify-center">
        <div className="text-center text-neutral-600">
          <div className="text-4xl mb-2">🗺️</div>
          <div>{error}</div>
          <div className="text-sm mt-2">
            {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && 
              'Please configure your Google Maps API key in the environment variables.'
            }
          </div>
        </div>
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <div className="h-[60vh] w-full rounded-2xl bg-neutral-200 flex items-center justify-center">
        <div className="text-center text-neutral-600">
          <div className="text-4xl mb-2">📍</div>
          <div>No sales with locations found</div>
          <div className="text-sm mt-2">Try adding some sales with addresses</div>
        </div>
      </div>
    )
  }

  return <div id="map" className="h-[60vh] w-full rounded-2xl bg-neutral-200" ref={ref} />
}
