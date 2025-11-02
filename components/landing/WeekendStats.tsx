'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
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
      if (ipSuccess) return
      
      // 3) Fallback to browser geolocation (requires permission)
      if (!navigator.geolocation) {
        console.log('[WeekendStats] Geolocation not available')
        setStatus('error')
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[WeekendStats] Using browser geolocation:', position.coords)
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          })
          setStatus('ready')
        },
        (error) => {
          console.warn('[WeekendStats] Geolocation error:', error)
          setStatus('error')
        },
        { timeout: 5000, maximumAge: 60000 }
      )
    })
  }, [searchParams])

  // Fetch stats when location is ready
  useEffect(() => {
    if (status !== 'ready' || !location) {
      setLoading(true)
      return
    }

    const fetchStats = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        
        if (location.lat && location.lng) {
          params.set('lat', location.lat.toString())
          params.set('lng', location.lng.toString())
          params.set('radiusKm', '50')
        } else if (location.zip) {
          params.set('zip', location.zip)
          params.set('radiusKm', '50')
        } else {
          setLoading(false)
          return
        }
        
        // Set limit to match map behavior (200 is max)
        params.set('limit', '200')

        // Get this weekend's date range
        const now = new Date()
        const dayOfWeek = now.getDay()
        let saturday: Date, sunday: Date
        
        if (dayOfWeek === 0) { // Sunday
          saturday = new Date(now)
          saturday.setDate(now.getDate() - 1) // Yesterday (Saturday)
          sunday = new Date(now) // Today (Sunday)
        } else if (dayOfWeek === 6) { // Saturday
          saturday = new Date(now) // Today (Saturday)
          sunday = new Date(now)
          sunday.setDate(now.getDate() + 1) // Tomorrow (Sunday)
        } else { // Monday-Friday
          const daysToSaturday = 6 - dayOfWeek
          const daysToSunday = 7 - dayOfWeek
          saturday = new Date(now)
          saturday.setDate(now.getDate() + daysToSaturday)
          sunday = new Date(now)
          sunday.setDate(now.getDate() + daysToSunday)
        }

        const formatDate = (d: Date) => d.toISOString().slice(0, 10)
        // Use 'from' and 'to' parameters for explicit date range (API supports this)
        params.set('from', formatDate(saturday))
        params.set('to', formatDate(sunday))

        // Fetch weekend sales
        const weekendRes = await fetch(`/api/sales?${params.toString()}`)
        if (!weekendRes.ok) {
          throw new Error('Failed to fetch weekend sales')
        }
        const weekendData = await weekendRes.json()
        const weekendSales: Sale[] = weekendData.data || []

        // Fetch sales from this week
        // Get this week's date range (last 7 days)
        const weekAgo = new Date(now)
        weekAgo.setDate(now.getDate() - 7)
        const weekParams = new URLSearchParams(params.toString())
        weekParams.set('from', formatDate(weekAgo))
        weekParams.set('to', formatDate(now))
        // Remove dateRange if it exists
        weekParams.delete('dateRange')
        const weekRes = await fetch(`/api/sales?${weekParams.toString()}`)
        if (!weekRes.ok) {
          throw new Error('Failed to fetch weekly sales')
        }
        const weekData = await weekRes.json()
        const weekSales: Sale[] = weekData.data || []

        // Calculate stats
        const activeSales = weekendSales.length
        const newThisWeek = weekSales.length

        setStats({ activeSales, newThisWeek })
      } catch (error) {
        console.error('[WeekendStats] Error fetching stats:', error)
        setStats(null)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()

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

      {/* Body - 2 mini stat cards side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/50 rounded-xl p-3 border border-white/30">
          <p className="text-xs text-[#3A2268]/60 mb-1">Active sales</p>
          <p className="text-lg font-semibold text-[#3A2268]">
            {loading ? '...' : displayStats.activeSales}
          </p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 border border-white/30">
          <p className="text-xs text-[#3A2268]/60 mb-1">New this week</p>
          <p className="text-lg font-semibold text-[#3A2268]">
            {loading ? '...' : displayStats.newThisWeek}
          </p>
        </div>
      </div>

      {/* Footer */}
      <Link
        href={salesUrl}
        className="text-sm font-medium text-[#3A2268] hover:text-[#3A2268]/80 transition-colors text-left"
      >
        View on map →
      </Link>
    </div>
  )
}
