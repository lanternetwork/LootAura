'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  const [loading, setLoading] = useState(false) // Start with false to show optimistic state
  const [error, setError] = useState<boolean>(false)
  const [isDefaultLocation, setIsDefaultLocation] = useState(false)
  const hasRealLocationStatsRef = useRef(false) // Track if we've received stats from a real location
  const ipGeolocationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
      // - Default location with > 0: update immediately (only if no real location stats yet)
      // - Default location with 0: don't update, wait for real location
      if (!isDefault) {
        // Real location resolved - always update (including 0, that's valid data)
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[WeekendStats] Updating stats from real location - Active sales:', activeSales)
        }
        hasRealLocationStatsRef.current = true // Mark that we have real location stats
        setStats({ activeSales })
        setLoading(false)
        setIsDefaultLocation(false)
        setError(false) // Clear error on successful fetch
      } else {
        // Default location - only process if we don't already have real location stats
        // This prevents race conditions where default location completes after real location
        if (hasRealLocationStatsRef.current) {
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[WeekendStats] Ignoring default location result - already have real location stats')
          }
          return // Don't update anything if we already have real location stats
        }
        
        // Default location - show result immediately (even if 0) for better UX
        // This makes the UI feel faster - user sees a number right away
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[WeekendStats] Updating stats from default location - Active sales:', activeSales)
        }
        setStats({ activeSales })
        setLoading(false) // Clear loading so we show the number immediately
        setError(false)
        
        // If default location has 0 sales, we'll still wait for real location to update
        // But at least user sees "0" instead of "---" which is less jarring
        if (activeSales === 0) {
          setIsDefaultLocation(true) // Mark as default so real location can override
        }
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
    setLoading(true) // Show loading only while fetching
    fetchStatsForLocation(defaultLocation, true)

    // 3) Try IP-based geolocation in parallel with timeout (works with VPNs and doesn't require permission)
    const tryIPGeolocation = async () => {
      try {
        // Set timeout for IP geolocation - if it takes too long, use default location
        const timeoutPromise = new Promise<null>((resolve) => {
          ipGeolocationTimeoutRef.current = setTimeout(() => {
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[WeekendStats] IP geolocation timeout, using default location')
            }
            resolve(null)
          }, 1500) // 1.5 second timeout
        })
        
        const ipPromise = fetch('/api/geolocation/ip').then(async (ipRes) => {
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
          return false
        }).catch((error) => {
          console.warn('[WeekendStats] IP geolocation failed:', error)
          return false
        })
        
        // Race between timeout and IP geolocation
        const result = await Promise.race([ipPromise, timeoutPromise])
        
        // Clear timeout if IP geolocation completed first
        if (ipGeolocationTimeoutRef.current) {
          clearTimeout(ipGeolocationTimeoutRef.current)
          ipGeolocationTimeoutRef.current = null
        }
        
        if (result === true) {
          return true // IP geolocation succeeded
        }
        
        // Timeout or failure - use default location
        setLocation(defaultLocation)
        console.log('[WeekendStats] Using default location after IP geolocation timeout/failure')
        
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
        return false
      } catch (error) {
        console.warn('[WeekendStats] IP geolocation error:', error)
        return false
      }
    }
    
    // Try IP geolocation (respects VPN location)
    tryIPGeolocation()
    
    // Cleanup timeout on unmount
    return () => {
      if (ipGeolocationTimeoutRef.current) {
        clearTimeout(ipGeolocationTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Show stats if available - prefer real location, but show default location if it has sales
  // This makes the UI feel faster by showing data immediately
  const displayStats = stats || null
  
  // Determine what to display: number if we have valid stats, "0" optimistically while loading, "---" only on error
  // Strategy: Show data immediately when available, show "0" optimistically while loading (less jarring than "---")
  const displayCount = (() => {
    if (error) {
      return '---'
    }
    // If we have stats, show them (even if from default location - better UX than "---")
    if (displayStats && typeof displayStats.activeSales === 'number') {
      return displayStats.activeSales
    }
    // While loading, show "0" optimistically instead of "---" (less jarring)
    // This will update to the real number when data arrives
    if (loading) {
      return 0
    }
    // No data and not loading - show "---" (shouldn't happen often)
    return '---'
  })()
  
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
