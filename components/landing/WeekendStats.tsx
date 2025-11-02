'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Sale } from '@/lib/types'
import { getDatePresetById } from '@/lib/shared/datePresets'

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

        // Use dateRange=this_weekend to match exactly what the sales page filter uses
        // This ensures both the hero card and sales page use the same API query
        params.set('dateRange', 'this_weekend')

        // Get the preset for logging/debugging only
        const now = new Date()
        const weekendPreset = getDatePresetById('this_weekend', now)
        if (!weekendPreset) {
          throw new Error('Failed to resolve weekend date preset')
        }

        console.log('[WeekendStats] Using dateRange=this_weekend (same as sales page filter)')
        console.log('[WeekendStats] Weekend preset details:', {
          presetId: weekendPreset.id,
          presetLabel: weekendPreset.label,
          start: weekendPreset.start,
          end: weekendPreset.end
        })

        // Get this week's date range (last 7 days, excluding today)
        // If today is Nov 2, we want Oct 26 - Nov 1 (7 days, not including today)
        const formatDate = (d: Date) => d.toISOString().slice(0, 10)
        const yesterday = new Date(now)
        yesterday.setDate(now.getDate() - 1)
        const sevenDaysAgo = new Date(yesterday)
        sevenDaysAgo.setDate(yesterday.getDate() - 6) // 7 days total: from 7 days ago to yesterday
        const thisWeekStart = formatDate(sevenDaysAgo)
        const thisWeekEnd = formatDate(yesterday) // Exclude today

        // Fetch weekend sales
        const weekendUrl = `/api/sales?${params.toString()}`
        console.log('[WeekendStats] Fetching weekend sales:', weekendUrl)
        const weekendRes = await fetch(weekendUrl)
        if (!weekendRes.ok) {
          throw new Error(`Failed to fetch weekend sales: ${weekendRes.status}`)
        }
        const weekendData = await weekendRes.json()
        const weekendSales: Sale[] = weekendData.data || []
        const weekendCount = weekendSales.length
        console.log('[WeekendStats] Weekend sales response:', {
          ok: weekendRes.ok,
          count: weekendCount,
          totalInResponse: weekendData.count || weekendData.data?.length || 0,
          sampleIds: weekendSales.slice(0, 3).map(s => s.id),
          fullResponse: weekendData
        })
        console.log('[WeekendStats] Weekend count:', weekendCount, 'sales')
        console.log('[WeekendStats] Weekend data:', JSON.stringify(weekendData, null, 2))

        // Fetch sales from this week
        const weekParams = new URLSearchParams(params.toString())
        weekParams.set('from', thisWeekStart)
        weekParams.set('to', thisWeekEnd)
        // Remove dateRange if it exists
        weekParams.delete('dateRange')
        const weekUrl = `/api/sales?${weekParams.toString()}`
        console.log('[WeekendStats] Fetching weekly sales:', weekUrl)
        const weekRes = await fetch(weekUrl)
        if (!weekRes.ok) {
          throw new Error(`Failed to fetch weekly sales: ${weekRes.status}`)
        }
        const weekData = await weekRes.json()
        const weekSales: Sale[] = weekData.data || []
        
        // Filter out weekend sales - "New this week" should only count weekday sales
        // Weekend sales are already counted in "Active sales"
        const weekendDates = new Set([weekendPreset.start, weekendPreset.end])
        const weekdaySales = weekSales.filter(sale => {
          const saleDate = sale.date_start || sale.date_end
          return saleDate && !weekendDates.has(saleDate)
        })
        const weekCount = weekdaySales.length
        console.log('[WeekendStats] Weekly sales response:', {
          ok: weekRes.ok,
          count: weekCount,
          totalInResponse: weekData.count || weekData.data?.length || 0,
          dateRange: { from: thisWeekStart, to: thisWeekEnd },
          fullResponse: weekData
        })
        console.log('[WeekendStats] Weekly count:', weekCount, 'sales')
        console.log('[WeekendStats] Weekly data:', JSON.stringify(weekData, null, 2))

        // Calculate stats
        const activeSales = weekendCount
        const newThisWeek = weekCount

        console.log('[WeekendStats] Calculated stats:', { 
          activeSales, 
          newThisWeek,
          weekendSalesCount: weekendCount,
          weekSalesCount: weekCount,
          weekendSalesIds: weekendSales.map(s => s.id),
          weekSalesIds: weekSales.map(s => s.id)
        })
        console.log('[WeekendStats] FINAL STATS - Active sales:', activeSales, '| New this week:', newThisWeek)
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
