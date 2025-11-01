'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import SaleCard from '@/components/SaleCard'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import { Sale } from '@/lib/types'
import { isTestSalesEnabled } from '@/lib/flags'
import { getDemoSales } from '@/lib/demo/demoSales'

interface LocationState {
  zip?: string
  lat?: number
  lng?: number
}

export function FeaturedSalesSection() {
  const searchParams = useSearchParams()
  const [location, setLocation] = useState<LocationState | null>(null)
  const [status, setStatus] = useState<'resolving' | 'ready' | 'error'>('resolving')
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [zipInput, setZipInput] = useState('')

  // Location inference in useEffect
  useEffect(() => {
    // 1) URL first
    const zipFromUrl = searchParams.get('zip') || searchParams.get('postal')
    if (zipFromUrl) {
      setLocation({ zip: zipFromUrl })
      setStatus('ready')
      return
    }

    // 2) Try IP-based geolocation first (works with VPNs and doesn't require permission)
    // This should be the PRIMARY method since it respects VPN location
    const tryIPGeolocation = async () => {
      try {
        const ipRes = await fetch('/api/geolocation/ip')
        if (ipRes.ok) {
          const ipData = await ipRes.json()
          if (ipData.lat && ipData.lng) {
            console.log('[FeaturedSales] Using IP geolocation:', ipData)
            const loc = { 
              lat: ipData.lat, 
              lng: ipData.lng,
              city: ipData.city,
              state: ipData.state
            }
            setLocation(loc)
            setStatus('ready')
            return true
          }
        }
      } catch (error) {
        console.warn('[FeaturedSales] IP geolocation failed:', error)
      }
      return false
    }
    
    // Try IP geolocation first (respects VPN location)
    tryIPGeolocation().then((ipSuccess) => {
      if (ipSuccess) {
        return // IP geolocation succeeded - use it
      }
      
      // IP geolocation failed - try browser geolocation (but it won't change with VPN)
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            // Use geolocation coordinates in memory only (do not persist to localStorage)
            // This avoids storing sensitive location data while still providing UX benefit
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            console.log('[FeaturedSales] Using browser geolocation:', loc)
            setLocation(loc)
            setStatus('ready')
          },
          () => {
            // Browser geolocation failed - try localStorage as fallback
            try {
              const saved = window.localStorage.getItem('loot-aura:lastLocation')
              if (saved) {
                try {
                  const parsed = JSON.parse(saved)
                  // Only use saved data if it's a ZIP code (not exact coordinates)
                  if (parsed && parsed.zip) {
                    console.log('[FeaturedSales] Using localStorage ZIP:', parsed.zip)
                    setLocation({ zip: parsed.zip })
                    setStatus('ready')
                    return
                  }
                } catch {
                  // Invalid JSON, continue
                }
              }
            } catch {
              // localStorage might be unavailable
            }
            
            // Final fallback city (Louisville)
            console.log('[FeaturedSales] Using fallback Louisville')
            const fallback = { zip: '40204' }
            setLocation(fallback)
            setStatus('ready')
          },
          { enableHighAccuracy: false, timeout: 3500 }
        )
      } else {
        // No geolocation API - try localStorage
        try {
          const saved = window.localStorage.getItem('loot-aura:lastLocation')
          if (saved) {
            try {
              const parsed = JSON.parse(saved)
              // Only use saved data if it's a ZIP code (not exact coordinates)
              if (parsed && parsed.zip) {
                setLocation({ zip: parsed.zip })
                setStatus('ready')
                return
              }
            } catch {
              // Invalid JSON, continue
            }
          }
        } catch {
          // localStorage might be unavailable
        }
        
        // Final fallback
        setLocation({ zip: '40204' })
        setStatus('ready')
      }
    })
  }, [searchParams])

  // Fetch sales when location is ready
  useEffect(() => {
    if (status !== 'ready' || !location) return

    const fetchSales = async () => {
      setLoading(true)
      try {
        // First, try to resolve ZIP to lat/lng for better accuracy
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
                console.log('[FeaturedSales] Resolved ZIP to lat/lng:', finalLat, finalLng)
              }
            } catch (error) {
              console.warn('[FeaturedSales] Failed to resolve ZIP, using ZIP in query:', error)
            }
          }
        }
        
        // Build URL with resolved coordinates or fallback to ZIP
        let url = '/api/sales?near=1&limit=30&radiusKm=50'
        
        if (finalLat && finalLng) {
          url += `&lat=${finalLat}&lng=${finalLng}`
        } else if (location.zip) {
          url += `&zip=${encodeURIComponent(location.zip)}`
        } else {
          // No valid location
          console.error('[FeaturedSales] No valid location available')
          setLoading(false)
          return
        }

        console.log('[FeaturedSales] Fetching sales from:', url)
        const res = await fetch(url)
        if (!res.ok) {
          console.error('[FeaturedSales] Failed to fetch sales:', res.status, res.statusText)
          setSales([])
          setLoading(false)
          return
        }
        
        const data = await res.json()
        console.log('[FeaturedSales] API response:', { 
          ok: data.ok, 
          hasSales: !!data.sales, 
          hasData: !!data.data,
          salesCount: data.sales?.length || 0,
          dataCount: data.data?.length || 0,
          count: data.count || 0
        })
        
        // Handle different response formats
        let allSales: Sale[] = []
        if (data.sales && Array.isArray(data.sales)) {
          allSales = data.sales
          console.log('[FeaturedSales] Using data.sales:', allSales.length)
        } else if (data.data && Array.isArray(data.data)) {
          allSales = data.data
          console.log('[FeaturedSales] Using data.data:', allSales.length)
        } else if (Array.isArray(data)) {
          allSales = data
          console.log('[FeaturedSales] Using direct array:', allSales.length)
        } else {
          console.warn('[FeaturedSales] No sales found in response:', data)
        }
        
        // Combine real sales with demo sales if flag is enabled
        // Keep order: real first, demo after
        const realSales = allSales ?? []
        let finalSales: Sale[] = []
        
        if (realSales.length > 0) {
          // Shuffle real sales and take up to 6
          const shuffled = [...realSales]
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
          }
          finalSales = shuffled.slice(0, 6)
          
          // If we have fewer than 6 real sales and flag is enabled, add demo sales
          if (isTestSalesEnabled() && finalSales.length < 6) {
            const demoNeeded = 6 - finalSales.length
            const demoSales = getDemoSales().slice(0, demoNeeded)
            finalSales = [...finalSales, ...demoSales]
          }
        } else if (isTestSalesEnabled()) {
          // No real sales, but flag enabled - show demo sales
          finalSales = getDemoSales().slice(0, 6)
        }
        
        if (finalSales.length > 0) {
          console.log('[FeaturedSales] Displaying', finalSales.length, 'sales (real:', realSales.length, 'demo:', isTestSalesEnabled() ? getDemoSales().length : 0, ')')
          setSales(finalSales)
        } else {
          console.warn('[FeaturedSales] No sales available, showing empty state')
          setSales([])
        }
      } catch (error) {
        console.error('Failed to fetch featured sales:', error)
        setSales([])
      } finally {
        setLoading(false)
      }
    }

    fetchSales()
    // Only depend on location.lat/lng/zip, not city/state changes to prevent re-render loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, location?.lat, location?.lng, location?.zip])

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedZip = zipInput.trim()
    const zipRegex = /^\d{5}(-\d{4})?$/
    
    if (!trimmedZip || !zipRegex.test(trimmedZip)) {
      return
    }

    try {
      const response = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(trimmedZip)}`)
      const data = await response.json()

      if (data.ok) {
        // Store only ZIP code (less sensitive than exact coordinates)
        // ZIP codes are user-provided and appropriate for localStorage
        const loc: LocationState = data.zip ? { zip: data.zip } : { lat: data.lat, lng: data.lng }
        // Only store ZIP codes, not exact coordinates, in localStorage
        if (data.zip) {
          try {
            window.localStorage.setItem('loot-aura:lastLocation', JSON.stringify({ zip: data.zip }))
          } catch (error) {
            // localStorage might be unavailable in some contexts
            console.warn('Failed to save location to localStorage:', error)
          }
        }
        setLocation(loc)
        setStatus('ready')
        setZipInput('')
      }
    } catch (error) {
      console.error('Failed to lookup ZIP:', error)
    }
  }

  // Resolving location state
  if (status === 'resolving' || loading) {
    return (
      <section className="py-12 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268]">
              Featured sales near you
            </h2>
            <Link
              href="/sales"
              className="text-sm text-[#3A2268]/70 hover:text-[#3A2268] transition-colors inline-flex items-center gap-1"
            >
              View all →
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SaleCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    )
  }

  // Location failed - show ZIP picker
  if (status === 'error' || !location) {
    return (
      <section className="py-12 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268]">
              Featured sales near you
            </h2>
            <Link
              href="/sales"
              className="text-sm text-[#3A2268]/70 hover:text-[#3A2268] transition-colors inline-flex items-center gap-1"
            >
              View all →
            </Link>
          </div>
          <div className="rounded-2xl border border-[#3A2268]/10 bg-[#F9FFF2] p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#3A2268] mb-1">Set your location</h3>
              <p className="text-sm text-[#3A2268]/70">Enter your ZIP so we can show nearby sales.</p>
            </div>
            <form onSubmit={handleZipSubmit} className="flex gap-2 w-full md:w-auto">
              <input
                type="text"
                value={zipInput}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^\d-]/g, '').slice(0, 10)
                  setZipInput(value)
                }}
                placeholder="Enter ZIP code"
                className="flex-1 md:w-32 px-3 py-2 border border-[#3A2268]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4B63A] focus:border-transparent text-[#3A2268]"
              />
              <button
                type="submit"
                disabled={!zipInput || zipInput.length < 5}
                className="px-4 py-2 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Save
              </button>
            </form>
          </div>
        </div>
      </section>
    )
  }

  // Location resolved - show sales
  // Sales are already shuffled and limited to 6 in the fetch effect
  const displaySales = sales
  // Display location: prefer city/state, then zip, then coordinates
  const locationDisplay = (() => {
    if (location.city) {
      // Safe decode of URL-encoded city names
      let cityName = location.city
      try {
        cityName = decodeURIComponent(location.city)
      } catch {
        // If not URL-encoded, use as-is
      }
      return location.state ? `${cityName}, ${location.state}` : cityName
    }
    if (location.zip) {
      return location.zip
    }
    if (location.lat && location.lng) {
      return `${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}`
    }
    return 'your area'
  })()

  return (
    <section className="py-12 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268]">
            Featured sales near you
          </h2>
          <Link
            href="/sales"
            className="text-sm text-[#3A2268]/70 hover:text-[#3A2268] transition-colors inline-flex items-center gap-1"
          >
            View all →
          </Link>
        </div>
        
        {displaySales.length === 0 ? (
          <div className="rounded-2xl border border-[#3A2268]/10 bg-white p-8 text-center">
            <p className="text-lg text-[#3A2268] mb-2">No sales near {locationDisplay} yet.</p>
            <p className="text-sm text-[#3A2268]/70 mb-4">
              Be the first to post a sale in your area!
            </p>
            <Link
              href="/sell/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium rounded-lg transition-colors"
            >
              Post your sale →
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displaySales.map((sale) => (
              <SaleCard key={sale.id} sale={sale} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
