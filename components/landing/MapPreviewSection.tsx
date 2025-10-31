'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SimpleMap from '@/components/location/SimpleMap'
import { Sale } from '@/lib/types'
import { createHybridPins } from '@/lib/pins/hybridClustering'

interface LocationState {
  zip?: string
  lat?: number
  lng?: number
}

export function MapPreviewSection() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [location, setLocation] = useState<LocationState | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [mapView, setMapView] = useState<{
    center: { lat: number; lng: number }
    zoom: number
    bounds: { west: number; south: number; east: number; north: number }
  } | null>(null)

  // Location inference (same logic as FeaturedSalesSection)
  useEffect(() => {
    // 1) URL first
    const zipFromUrl = searchParams.get('zip') || searchParams.get('postal')
    if (zipFromUrl) {
      setLocation({ zip: zipFromUrl })
      return
    }

    // 2) localStorage (only ZIP codes)
    try {
      const saved = window.localStorage.getItem('loot-aura:lastLocation')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (parsed && parsed.zip) {
            setLocation({ zip: parsed.zip })
            return
          }
        } catch {
          // Invalid JSON, continue
        }
      }
    } catch {
      // localStorage might be unavailable
    }

    // 3) geolocation (non-blocking)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setLocation(loc)
        },
        () => {
          // 4) fallback city
          const fallback = { zip: '40204' }
          setLocation(fallback)
        },
        { enableHighAccuracy: false, timeout: 3500 }
      )
      return
    }

    // 4) final fallback
    setLocation({ zip: '40204' })
  }, [searchParams])

  // Fetch sales and resolve location
  useEffect(() => {
    if (!location) return

    const fetchData = async () => {
      setLoading(true)
      try {
        // First, resolve ZIP to lat/lng if needed
        let finalLat = location.lat
        let finalLng = location.lng
        
        if (!finalLat || !finalLng) {
          if (location.zip) {
            try {
              const geoRes = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(location.zip)}`)
              const geoData = await geoRes.json()
              if (geoData.ok && geoData.lat && geoData.lng) {
                finalLat = parseFloat(geoData.lat)
                finalLng = parseFloat(geoData.lng)
              }
            } catch (error) {
              console.warn('[MapPreview] Failed to resolve ZIP:', error)
            }
          }
        }

        if (!finalLat || !finalLng) {
          setLoading(false)
          return
        }

        // Calculate default bounds for preview (25km radius)
        const radiusKm = 25
        const latRange = radiusKm / 111.0
        const lngRange = radiusKm / (111.0 * Math.cos(finalLat * Math.PI / 180))
        
        const bounds = {
          west: finalLng - lngRange,
          south: finalLat - latRange,
          east: finalLng + lngRange,
          north: finalLat + latRange
        }

        // Set map view
        setMapView({
          center: { lat: finalLat, lng: finalLng },
          zoom: 11,
          bounds
        })

        // Fetch sales for this location
        const url = `/api/sales?near=1&lat=${finalLat}&lng=${finalLng}&radiusKm=${radiusKm}&limit=50`
        const res = await fetch(url)
        
        if (res.ok) {
          const data = await res.json()
          const fetchedSales: Sale[] = data.sales || data.data || []
          setSales(fetchedSales)
        }
      } catch (error) {
        console.error('[MapPreview] Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [location])

  // Handle map click - navigate to sales page
  const handleMapClick = () => {
    if (!mapView) return
    
    const params = new URLSearchParams()
    params.set('lat', mapView.center.lat.toString())
    params.set('lng', mapView.center.lng.toString())
    params.set('zoom', mapView.zoom.toString())
    
    router.push(`/sales?${params.toString()}`)
  }

  // Generate hybrid pins for the preview
  const hybridPins = mapView && sales.length > 0 ? {
    sales,
    selectedId: null,
    onLocationClick: () => {}, // Disabled - no click handling on preview
    viewport: mapView
  } : undefined

  return (
    <section className="py-12 bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left column - text */}
          <div className="space-y-4">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268]">
              Browse on the live map
            </h2>
            <p className="text-base text-[#3A2268]/70">
              Pan, zoom, and filter by category to see what&apos;s happening in your neighborhood.
            </p>
            <Link
              href="/sales"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium rounded-lg transition-colors"
            >
              Open the map →
            </Link>
          </div>

          {/* Right column - map preview (non-interactive, clickable) */}
          <div className="rounded-2xl border border-[#3A2268]/10 bg-[#F9FFF2] p-4 overflow-hidden">
            <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 cursor-pointer group">
              {loading || !mapView ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#F9FFF2] to-[#FFF8E7]">
                  <div className="text-center text-[#3A2268]/40">
                    <div className="text-4xl mb-2">🗺️</div>
                    <p className="text-sm font-medium">Loading map...</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Non-interactive map - pins disabled via pointer-events */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 pointer-events-auto">
                      <SimpleMap
                        center={mapView.center}
                        zoom={mapView.zoom}
                        hybridPins={hybridPins}
                        onViewportChange={() => {}} // Disabled - no viewport changes
                        interactive={false} // Disable all map interactions
                      />
                    </div>
                  </div>
                  
                  {/* Click overlay to make entire map clickable */}
                  <div 
                    className="absolute inset-0 z-20 bg-transparent group-hover:bg-black/5 transition-colors"
                    onClick={handleMapClick}
                    style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                    aria-label="Click to view full interactive map"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleMapClick()
                      }
                    }}
                  >
                    <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-[#3A2268] font-medium text-center shadow-sm">
                      Click to explore on the live map →
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
