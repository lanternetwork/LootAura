'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'

interface WeekendStatsData {
  activeSales: number
  newThisWeek: number
}

interface LocationState {
  zip?: string
  lat?: number
  lng?: number
  city?: string
  state?: string
}

export function WeekendStats() {
  const searchParams = useSearchParams()
  const [location, setLocation] = useState<LocationState | null>(null)
  const [status, setStatus] = useState<'resolving' | 'ready' | 'error'>('resolving')
  const [stats, setStats] = useState<WeekendStatsData | null>(null)
  const [loading, setLoading] = useState(true)

  // Location inference - same logic as FeaturedSalesSection
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
            console.log('[WeekendStats] Using IP geolocation:', ipData)
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
        console.warn('[WeekendStats] IP geolocation failed:', error)
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
            console.log('[WeekendStats] Using browser geolocation:', loc)
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
                    console.log('[WeekendStats] Using localStorage ZIP:', parsed.zip)
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
            
            // Final fallback city (Louisville as last resort)
            console.log('[WeekendStats] Using fallback Louisville')
            const fallback = { zip: '40204', city: 'Louisville', state: 'KY' }
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
        setLocation({ zip: '40204', city: 'Louisville', state: 'KY' })
        setStatus('ready')
      }
    })
  }, [searchParams])

  // Fetch stats when location is ready
  useEffect(() => {
    if (status !== 'ready' || !location) return

    const fetchStats = async () => {
      setLoading(true)
      try {
        // Calculate this weekend's date range
        const now = new Date()
        const saturday = new Date(now)
        saturday.setDate(now.getDate() + (6 - now.getDay()))
        const sunday = new Date(saturday)
        sunday.setDate(saturday.getDate() + 1)
        
        const startDate = saturday.toISOString().split('T')[0]
        const endDate = sunday.toISOString().split('T')[0]

        // First, resolve ZIP to lat/lng if needed, or get city name from ZIP lookup
        let finalLat = location.lat
        let finalLng = location.lng
        let cityName = location.city || 'your area'
        let stateCode = location.state || ''
        
        if (!finalLat || !finalLng) {
          if (location.zip) {
            try {
              const geoRes = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(location.zip)}`)
              const geoData = await geoRes.json()
              if (geoData.ok && geoData.lat && geoData.lng) {
                finalLat = parseFloat(geoData.lat)
                finalLng = parseFloat(geoData.lng)
                if (geoData.city) cityName = geoData.city
                if (geoData.state) stateCode = geoData.state
              }
            } catch (error) {
              console.warn('[WeekendStats] Failed to resolve ZIP:', error)
            }
          }
        }

        // Build URL with resolved coordinates or fallback to ZIP
        let url = '/api/sales?near=1&radiusKm=25&from=' + startDate + '&to=' + endDate + '&limit=200'
        
        if (finalLat && finalLng) {
          url += `&lat=${finalLat}&lng=${finalLng}`
        } else if (location.zip) {
          url += `&zip=${encodeURIComponent(location.zip)}`
        } else {
          // No valid location
          setLoading(false)
          return
        }
        
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error(`Failed to fetch: ${res.status}`)
        }
        
        const data = await res.json()
        
        // Handle different response formats
        const sales: Sale[] = data.sales || data.data || []
        
        // Count active sales for this weekend
        const activeSales = sales.length
        
        // Calculate new this week (sales created in last 7 days)
        const weekAgo = new Date(now)
        weekAgo.setDate(now.getDate() - 7)
        const newThisWeek = sales.filter((sale) => {
          if (!sale.created_at) return false
          const created = new Date(sale.created_at)
          return created >= weekAgo
        }).length

        setStats({ activeSales, newThisWeek })
        // Update location with city/state for display (only if not already set to prevent re-render loop)
        setLocation(prev => {
          if (prev?.city === cityName && prev?.state === stateCode) {
            return prev // No change, don't update
          }
          return prev ? { ...prev, city: cityName, state: stateCode } : null
        })
      } catch (error) {
        console.error('Failed to fetch weekend stats:', error)
        // Use fallback values
        setStats({ activeSales: 12, newThisWeek: 3 })
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    // Only depend on location.lat/lng/zip, not city/state changes to prevent re-render loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, location?.lat, location?.lng, location?.zip])

  // Show fallback values while loading or on error
  const displayStats = stats || { activeSales: 12, newThisWeek: 3 }
  // Decode URL-encoded city name if present (safe decode)
  const cityName = (() => {
    if (!location?.city) return null
    try {
      // Try to decode URL-encoded strings (e.g., "Los%20Angeles" -> "Los Angeles")
      return decodeURIComponent(location.city)
    } catch {
      // If not URL-encoded, return as-is
      return location?.city ?? null
    }
  })()
  const displayLocation = cityName 
    ? `${cityName}${location?.state ? `, ${location.state}` : ''}`
    : 'your area'

  return (
    <div className="bg-white/70 backdrop-blur rounded-2xl border border-white/40 p-4">
      <p className="text-sm text-[#3A2268]/70 mb-2">This weekend near</p>
      <p className="text-lg font-semibold text-[#3A2268] mb-3">{displayLocation}</p>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-[#3A2268]/70">Active sales</span>
          <span className="text-base font-semibold text-[#3A2268]">
            {loading ? '...' : displayStats.activeSales}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-[#3A2268]/70">New this week</span>
          <span className="text-base font-semibold text-[#3A2268]">
            {loading ? '...' : displayStats.newThisWeek}
          </span>
        </div>
      </div>
    </div>
  )
}

