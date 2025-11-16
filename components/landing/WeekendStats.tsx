'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface WeekendStatsData {
  activeSales: number
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
  const [stats, setStats] = useState<WeekendStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDefaultLocation, setIsDefaultLocation] = useState(false)

  // Fetch stats with a given location
  const fetchStatsForLocation = useCallback(async (loc: LocationState, isDefault = false) => {
    try {
      const params = new URLSearchParams()
      
      if (loc.lat && loc.lng) {
        params.set('lat', loc.lat.toString())
        params.set('lng', loc.lng.toString())
        params.set('radiusKm', '50')
      } else if (loc.zip) {
        params.set('zip', loc.zip)
        params.set('radiusKm', '50')
      } else {
        return
      }
      
      // Use dateRange=this_weekend to match exactly what the sales page filter uses
      params.set('dateRange', 'this_weekend')

      // Use lightweight count endpoint for faster loading
      const countUrl = `/api/sales/count?${params.toString()}`
      console.log('[WeekendStats] Fetching weekend sales count:', countUrl, { isDefault })
      const countRes = await fetch(countUrl)
      if (!countRes.ok) {
        throw new Error(`Failed to fetch weekend sales count: ${countRes.status}`)
      }
      const countData = await countRes.json()
      const weekendCount = countData.count || 0
      console.log('[WeekendStats] Weekend sales count response:', {
        ok: countRes.ok,
        count: weekendCount,
        durationMs: countData.durationMs,
        isDefault
      })

      // Calculate stats
      const activeSales = weekendCount

      // Update stats based on location type:
      // - Real location: always update (even if 0, that's the actual count)
      // - Default location with > 0: update immediately
      // - Default location with 0: don't update, wait for real location
      if (!isDefault) {
        // Real location resolved - always update
        console.log('[WeekendStats] Updating stats from real location - Active sales:', activeSales)
        setStats({ activeSales })
        setLoading(false)
        setIsDefaultLocation(false)
      } else if (activeSales > 0) {
        // Default location has sales - show immediately
        console.log('[WeekendStats] Updating stats from default location - Active sales:', activeSales)
        setStats({ activeSales })
        setLoading(false)
      } else {
        // Default location returned 0 - wait for real location
        console.log('[WeekendStats] Default location returned 0, waiting for real location')
        setIsDefaultLocation(true)
        // Keep loading true and don't update stats - show fallback
      }
    } catch (error) {
      console.error('[WeekendStats] Error fetching stats:', error)
      // Only set stats to null if we don't have any stats yet
      if (!stats) {
        setStats(null)
        setLoading(false)
      }
    }
  }, [stats])

  // Location inference - optimized to start fetching immediately
  useEffect(() => {
    // 1) URL first (fastest path)
    const zipFromUrl = searchParams.get('zip') || searchParams.get('postal')
    if (zipFromUrl) {
      const loc = { zip: zipFromUrl }
      setLocation(loc)
      setIsDefaultLocation(false)
      fetchStatsForLocation(loc, false)
      return
    }

    // 2) Start with a default US location to fetch stats immediately
    // This ensures the count appears quickly while we resolve the actual location
    const defaultLocation: LocationState = { lat: 39.8283, lng: -98.5795 } // US center
    fetchStatsForLocation(defaultLocation, true)

    // 3) Try IP-based geolocation in parallel (works with VPNs and doesn't require permission)
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
            setIsDefaultLocation(false)
            // Fetch with actual location (will update the count if different)
            fetchStatsForLocation(loc, false)
            return true
          }
        }
      } catch (error) {
        console.warn('[WeekendStats] IP geolocation failed:', error)
      }
      return false
    }
    
    // Try IP geolocation (respects VPN location)
    tryIPGeolocation().then((ipSuccess) => {
      if (ipSuccess) return
      
      // If IP geolocation failed, keep using default location
      setLocation(defaultLocation)
      console.log('[WeekendStats] Using default location after IP geolocation failed')
    })
  }, [searchParams])

  // Show fallback values while loading, on error, or if we only have a 0 from default location
  const displayStats = (stats && (!isDefaultLocation || stats.activeSales > 0)) 
    ? stats 
    : { activeSales: 12 }
  
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

  // Build sales URL with location params
  const salesUrl = (() => {
    const params = new URLSearchParams()
    if (location?.lat && location?.lng) {
      params.set('lat', location.lat.toString())
      params.set('lng', location.lng.toString())
    } else if (location?.zip) {
      params.set('zip', location.zip)
    }
    return `/sales${params.toString() ? `?${params.toString()}` : ''}`
  })()

  return (
    <div className="rounded-3xl bg-white/70 backdrop-blur-md shadow-sm border border-white/50 p-5 lg:p-6 flex flex-col gap-4 max-w-sm lg:ml-auto w-full max-w-md lg:max-w-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#3A2268]/60 mb-1">This weekend near</p>
          <p className="text-lg font-semibold text-[#3A2268] leading-tight">{displayLocation}</p>
        </div>
        <div className="flex-shrink-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Live data
          </span>
        </div>
      </div>

      {/* Body - Active sales stat */}
      <div className="bg-white/50 rounded-xl p-4 border border-white/30">
        <p className="text-xs text-[#3A2268]/60 mb-2">Active sales</p>
        <p className="text-2xl font-semibold text-[#3A2268]">
          {loading ? '...' : displayStats.activeSales}
        </p>
      </div>

      {/* Footer */}
      <Link
        href={salesUrl}
        className="text-sm font-medium link-accent transition-colors text-left"
      >
        View on map →
      </Link>
    </div>
  )
}
