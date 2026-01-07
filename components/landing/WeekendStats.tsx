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
  const [error, setError] = useState<boolean>(false)
  const [isDefaultLocation, setIsDefaultLocation] = useState(false)

  // Fetch stats with a given location
  const fetchStatsForLocation = useCallback(async (loc: LocationState, isDefault = false) => {
    // Clear error state when starting a new fetch
    setError(false)
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
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[WeekendStats] Fetching weekend sales count:', countUrl, { isDefault })
      }
      const countRes = await fetch(countUrl)
      if (!countRes.ok) {
        const errorText = await countRes.text().catch(() => 'Unknown error')
        throw new Error(`Failed to fetch weekend sales count: ${countRes.status} - ${errorText}`)
      }
      const countData = await countRes.json()
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[WeekendStats] API response:', countData)
      }
      // Validate response format - handle both success and error response formats
      // API may return { ok: true, count: number } or { ok: false, error: string } or { count: number }
      let weekendCount: number | null = null
      if (countData && typeof countData === 'object') {
        if (countData.ok === false) {
          // Error response format - mark as error, don't set count
          throw new Error(`API returned error: ${countData.error || 'Unknown error'}`)
        } else if (typeof countData.count === 'number') {
          weekendCount = countData.count
        } else {
          // Invalid response format - mark as error
          throw new Error('Invalid response format: count is not a number')
        }
      } else {
        // Invalid response format
        throw new Error('Invalid response format: expected object')
      }
      
      // At this point, weekendCount must be a number (all error cases throw)
      if (weekendCount === null) {
        throw new Error('Unexpected: weekendCount is null after validation')
      }
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[WeekendStats] Weekend sales count response:', {
          ok: countRes.ok,
          count: weekendCount,
          durationMs: countData.durationMs,
          isDefault
        })
      }

      // Calculate stats - weekendCount is guaranteed to be a number here
      const activeSales: number = weekendCount

      // Update stats based on location type:
      // - Real location: always update (even if 0, that's the actual count)
      // - Default location with > 0: update immediately
      // - Default location with 0: don't update, wait for real location
      if (!isDefault) {
        // Real location resolved - always update (including 0, that's valid data)
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[WeekendStats] Updating stats from real location - Active sales:', activeSales)
        }
        setStats({ activeSales })
        setLoading(false)
        setIsDefaultLocation(false)
        setError(false) // Clear error on successful fetch
      } else if (activeSales > 0) {
        // Default location has sales - show immediately
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[WeekendStats] Updating stats from default location - Active sales:', activeSales)
        }
        setStats({ activeSales })
        setLoading(false)
        setError(false) // Clear error on successful fetch
      } else {
        // Default location returned 0 - wait for real location
        // But don't keep loading indefinitely - if IP geolocation fails, we'll show 0
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[WeekendStats] Default location returned 0, waiting for real location')
        }
        setIsDefaultLocation(true)
        // Keep loading true and don't update stats - show fallback
        // The IP geolocation will either succeed (update stats) or fail (we'll show 0)
      }
    } catch (error) {
      console.error('[WeekendStats] Error fetching stats:', error)
      // On error, mark as error state - will show "---" instead of a number
      // Always clear loading state on error, but only set error if we don't have stats
      setLoading(false)
      if (!stats) {
        setError(true)
      }
      // If we have stats from a previous successful fetch, keep them
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
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[WeekendStats] Using IP geolocation:', ipData)
            }
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
      
      // If IP geolocation failed, use default location
      setLocation(defaultLocation)
      console.log('[WeekendStats] Using default location after IP geolocation failed')
      
      // If we don't have stats yet (default location returned 0 and we're waiting),
      // show 0 since we've exhausted all location options
      setStats((prevStats) => {
        if (!prevStats) {
          return { activeSales: 0 }
        }
        return prevStats
      })
      setLoading(false)
      setIsDefaultLocation(false) // No longer default - we've tried everything
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Show fallback values while loading, on error, or if we only have a 0 from default location
  // IMPORTANT: never hardcode a non-zero count; fallback should be neutral when we don't have real data
  // If we have stats from a real location (not default), always show them (even if 0)
  // Only hide stats if they're from default location AND are 0 (waiting for real location)
  const displayStats = (stats && (!isDefaultLocation || stats.activeSales > 0)) 
    ? stats 
    : null
  
  // Determine what to display: number if we have valid stats, "---" if loading/error/no data
  // Show "0" if we have valid stats with 0 sales (real location, not default)
  const displayCount = (loading || error || !displayStats || typeof displayStats.activeSales !== 'number')
    ? '---'
    : displayStats.activeSales
  
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
          {displayCount}
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
