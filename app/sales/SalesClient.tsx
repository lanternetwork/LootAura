'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import { GetSalesParams, formatDistance } from '@/lib/data/sales'
import SalesMap from '@/components/location/SalesMap'
import ZipInput from '@/components/location/ZipInput'
import SaleCard from '@/components/SaleCard'
import FiltersModal from '@/components/filters/FiltersModal'
import FilterTrigger from '@/components/filters/FilterTrigger'
import DateWindowLabel from '@/components/filters/DateWindowLabel'
import DegradedBanner from '@/components/DegradedBanner'
import { useFilters } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'
import LoadMoreButton from '@/components/LoadMoreButton'

// Cookie utility functions
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

interface SalesClientProps {
  initialSales: Sale[]
  initialSearchParams: {
    lat?: string
    lng?: string
    distanceKm?: string
    city?: string
    categories?: string
    dateFrom?: string
    dateTo?: string
    page?: string
    pageSize?: string
  }
  initialCenter?: { lat: number; lng: number; label?: { zip?: string; city?: string; state?: string } }
  user: User | null
}

export default function SalesClient({ initialSales, initialSearchParams, initialCenter, user }: SalesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { filters, updateFilters, hasActiveFilters } = useFilters(
    initialCenter?.lat && initialCenter?.lng ? { lat: initialCenter.lat, lng: initialCenter.lng } : undefined
  )

  // Debug logging
  console.log('[SALES] SalesClient render:', {
    initialCenter,
    filters,
    searchParams: Object.fromEntries(searchParams.entries())
  })

  const [sales, setSales] = useState<Sale[]>(initialSales)
  const [loading, setLoading] = useState(false)
  const [fetchedOnce, setFetchedOnce] = useState(false)
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [dateWindow, setDateWindow] = useState<any>(null)
  const [degraded, setDegraded] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mapSales, setMapSales] = useState<Sale[]>([])
  const [nextPageCache, setNextPageCache] = useState<Sale[] | null>(null)
  const [locationAccuracy, setLocationAccuracy] = useState<'server' | 'client' | 'fallback'>('server')

  // Detect neutral fallback center (do not auto-fetch in this case)
  const isNeutralFallback = !!initialCenter && initialCenter.lat === 39.8283 && initialCenter.lng === -98.5795

  const fetchSales = useCallback(async (append = false) => {
    console.log('[SALES] fetchSales start', { append, filters })
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    console.log(`[SALES] fetchSales called with location: ${filters.lat}, ${filters.lng}, append: ${append}`)
    
    // If no location, don't try to fetch sales yet
    if (!filters.lat || !filters.lng) {
      console.log('[SALES] No location provided, waiting for location')
      setSales([])
      setDateWindow(null)
      setDegraded(false)
      setHasMore(true)
      if (append) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
      return
    }

    // Map dateRange preset to concrete ISO dates
    let dateFrom: string | undefined
    let dateTo: string | undefined
    const today = new Date()
    const toISO = (d: Date) => d.toISOString().slice(0, 10)
    if (filters.dateRange === 'today') {
      const start = new Date(today)
      const end = new Date(today)
      dateFrom = toISO(start)
      dateTo = toISO(end)
    } else if (filters.dateRange === 'weekend' || filters.dateRange === 'next_weekend') {
      // find upcoming Saturday/Sunday for weekend, or next weekend
      const base = new Date(today)
      const day = base.getDay() // 0 Sun, 6 Sat
      const offsetToSat = ((6 - day + 7) % 7) + (filters.dateRange === 'next_weekend' ? 7 : 0)
      const sat = new Date(base)
      sat.setDate(base.getDate() + offsetToSat)
      const sun = new Date(sat)
      sun.setDate(sat.getDate() + 1)
      dateFrom = toISO(sat)
      dateTo = toISO(sun)
    }

    const params: GetSalesParams = {
      lat: filters.lat,
      lng: filters.lng,
      distanceKm: (filters.distance || 25) * 1.60934, // Convert miles to km
      city: filters.city,
      categories: filters.categories.length > 0 ? filters.categories : undefined,
      // API expects startDate/endDate keys
      ...(dateFrom ? { startDate: dateFrom } as any : {}),
      ...(dateTo ? { endDate: dateTo } as any : {}),
      limit: 24,
      offset: append ? sales.length : 0,
    }
    console.log('[SALES] fetch params:', params)

    const queryString = new URLSearchParams(
      Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            acc[key] = value.join(',')
          } else {
            acc[key] = String(value)
          }
        }
        return acc
      }, {} as Record<string, string>)
    ).toString()

    try {
      console.log(`[SALES] Fetching from: /api/sales?${queryString}`)
      const res = await fetch(`/api/sales?${queryString}`)
      const data = await res.json()
      console.log(`[SALES] API response:`, data)
      
      if (data.ok) {
        const newSales = data.data || []
        if (append) {
          setSales(prev => [...prev, ...newSales])
        } else {
          setSales(newSales)
        }
        setDateWindow(data.dateWindow || null)
        setDegraded(data.degraded || false)
        const pageHasMore = newSales.length === 24
        setHasMore(pageHasMore)
        console.log(`[SALES] ${append ? 'Appended' : 'Set'} ${newSales.length} sales, hasMore: ${pageHasMore}`)

        // Prefetch next page in background for instant next click
        if (!append && pageHasMore) {
          const nextParams: GetSalesParams = {
            ...params,
            offset: newSales.length,
          }
          console.log('[SALES] prefetch next page params:', nextParams)
          const nextQs = new URLSearchParams(
            Object.entries(nextParams).reduce((acc, [key, value]) => {
              if (value !== undefined && value !== null && value !== '') {
                if (Array.isArray(value)) {
                  acc[key] = value.join(',')
                } else {
                  acc[key] = String(value)
                }
              }
              return acc
            }, {} as Record<string, string>)
          ).toString()

          // Fire and forget prefetch
          fetch(`/api/sales?${nextQs}`)
            .then(res => res.json())
            .then(pref => {
              if (pref?.ok && Array.isArray(pref.data)) {
                setNextPageCache(pref.data)
                // Track if there is more beyond the next cached page
                if (pref.data.length < 24) {
                  setHasMore(false)
                }
              }
            })
            .catch(() => {})
        }
      } else {
        console.error('Sales API error:', data.error)
        if (!append) {
          setSales([])
          setDateWindow(null)
          setDegraded(false)
        }
        setHasMore(false)
      }
      setFetchedOnce(true)
    } catch (error) {
      console.error('Error fetching sales:', error)
      setSales([])
      setFetchedOnce(true)
    } finally {
      if (append) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }, [filters.lat, filters.lng, filters.distance, filters.city, filters.categories, filters.dateRange])

  // Client-side geolocation removed; handlers not used

  // Fetch larger set for map pins so all in-radius sales are shown (use markers endpoint)
  const fetchMapSales = useCallback(async () => {
    if (!filters.lat || !filters.lng) return
    try {
      console.log('[MAP] fetchMapSales called with filters:', filters)
      // Map dateRange preset to concrete ISO dates for markers too
      let dateFrom: string | undefined
      let dateTo: string | undefined
      const today = new Date()
      const toISO = (d: Date) => d.toISOString().slice(0, 10)
      if (filters.dateRange === 'today') {
        const start = new Date(today)
        const end = new Date(today)
        dateFrom = toISO(start)
        dateTo = toISO(end)
      } else if (filters.dateRange === 'weekend' || filters.dateRange === 'next_weekend') {
        const base = new Date(today)
        const day = base.getDay()
        const offsetToSat = ((6 - day + 7) % 7) + (filters.dateRange === 'next_weekend' ? 7 : 0)
        const sat = new Date(base)
        sat.setDate(base.getDate() + offsetToSat)
        const sun = new Date(sat)
        sun.setDate(sat.getDate() + 1)
        dateFrom = toISO(sat)
        dateTo = toISO(sun)
      }

      const params = new URLSearchParams()
      params.set('lat', String(filters.lat))
      params.set('lng', String(filters.lng))
      params.set('maxKm', String((filters.distance || 25) * 1.60934))
      if (filters.categories.length > 0) params.set('tags', filters.categories.join(','))
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      params.set('limit', '1000')

      console.log('[MAP] Fetching markers from:', `/api/sales/markers?${params.toString()}`)
      const res = await fetch(`/api/sales/markers?${params.toString()}`)
      const data = await res.json()
      console.log('[MAP] Markers response:', data)
      if (Array.isArray(data)) {
        console.log('[MAP] Setting mapSales to:', data.length, 'markers')
        setMapSales(data as any)
      } else {
        console.log('[MAP] Setting mapSales to empty array')
        setMapSales([])
      }
    } catch (error) {
      console.error('[MAP] Error fetching markers:', error)
      setMapSales([])
    }
  }, [filters.lat, filters.lng, filters.distance, filters.categories, filters.dateRange])

  const loadMore = useCallback(async () => {
    // Use prefetched next page if available for instant UI
    if (nextPageCache && nextPageCache.length > 0) {
      setSales(prev => [...prev, ...nextPageCache])
      // Determine if there might be more based on cached size
      const cachedHasMore = nextPageCache.length === 24
      setHasMore(cachedHasMore)
      setNextPageCache(null)

      // Prefetch the following page in background
      const nextOffset = sales.length + (cachedHasMore ? 24 : 0)
      if (cachedHasMore) {
        const params: GetSalesParams = {
          lat: filters.lat!,
          lng: filters.lng!,
          distanceKm: (filters.distance || 25) * 1.60934,
          city: filters.city,
          categories: filters.categories.length > 0 ? filters.categories : undefined,
          dateRange: filters.dateRange !== 'any' ? filters.dateRange : undefined,
          limit: 24,
          offset: nextOffset,
        }
        const qs = new URLSearchParams(
          Object.entries(params).reduce((acc, [key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              if (Array.isArray(value)) {
                acc[key] = value.join(',')
              } else {
                acc[key] = String(value)
              }
            }
            return acc
          }, {} as Record<string, string>)
        ).toString()
        fetch(`/api/sales?${qs}`)
          .then(res => res.json())
          .then(pref => {
            if (pref?.ok && Array.isArray(pref.data)) {
              setNextPageCache(pref.data)
              if (pref.data.length < 24) setHasMore(false)
            }
          })
          .catch(() => {})
      }
      return
    }

    await fetchSales(true)
  }, [nextPageCache, fetchSales, filters.lat, filters.lng, filters.distance, filters.city, filters.categories, filters.dateRange])

  useEffect(() => {
    console.log('[SALES] Filters changed, fetching sales and map data')
    fetchSales()
    fetchMapSales()
  }, [fetchSales, fetchMapSales])

  // Refetch map pins when filters location/range change
  useEffect(() => {
    fetchMapSales()
  }, [fetchMapSales])

  // Initialize filters from server-provided center once, only if no location set yet
  useEffect(() => {
    if (
      initialCenter?.lat && initialCenter?.lng &&
      !isNeutralFallback &&
      !filters.lat && !filters.lng
    ) {
      console.log(`[SALES] Initializing filters with server location: ${initialCenter.lat}, ${initialCenter.lng}`)
      updateFilters({ lat: initialCenter.lat, lng: initialCenter.lng })
    }
    // Do not include updateFilters in deps to avoid loop; this runs only when initial inputs change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCenter?.lat, initialCenter?.lng, isNeutralFallback, filters.lat, filters.lng])

  // Initialize location from cookie on mount
  useEffect(() => {
    const cookieData = getCookie('la_loc')
    if (cookieData && !filters.lat && !filters.lng) {
      try {
        const locationData = JSON.parse(cookieData)
        if (locationData.lat && locationData.lng) {
          console.log(`[SALES] Loading location from cookie: ${locationData.zip} (${locationData.city}, ${locationData.state})`)
          updateFilters({
            lat: locationData.lat,
            lng: locationData.lng,
            city: locationData.city
          })
        }
      } catch (error) {
        console.error('Failed to parse location cookie:', error)
      }
    }
  }, []) // Only run on mount

  // Geolocation prompt removed by design; no client location requests

  const handleZipLocationFound = (lat: number, lng: number, city?: string, state?: string, zip?: string) => {
    setZipError(null)
    console.log(`[ZIP] Setting new location: ${lat}, ${lng} (${city}, ${state})`)
    
    updateFilters({
      lat,
      lng,
      city: city || undefined
    })
    
    // Persist la_loc cookie for 24h so server can use it on next visit
    try {
      const cookiePayload = JSON.stringify({ lat, lng, city, state, zip })
      document.cookie = `la_loc=${cookiePayload}; Max-Age=${60 * 60 * 24}; Path=/; SameSite=Lax`
    } catch {}

    // Update URL with new location and ZIP
    const params = new URLSearchParams(searchParams.toString())
    params.set('lat', lat.toString())
    params.set('lng', lng.toString())
    if (city) params.set('city', city)
    if (state) params.set('state', state)
    if (zip) params.set('zip', zip)
    
    const newUrl = `${window.location.pathname}?${params.toString()}`
    router.push(newUrl)
    
    // Force a manual fetch to ensure it happens
    console.log(`[ZIP] Manually triggering fetchSales after ZIP lookup`)
    setTimeout(() => {
      fetchSales()
    }, 100)
  }

  const handleZipError = (error: string) => {
    setZipError(error)
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <div className="lg:w-2/3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Sales Search</h1>
              {dateWindow && (
                <DateWindowLabel dateWindow={dateWindow} className="mb-4" />
              )}
              {degraded && (
                <DegradedBanner className="mb-4" />
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  {/* ZIP Input */}
                  <div className="flex-1 sm:flex-none">
                    <div className="text-xs text-gray-500 mb-1">Search different area:</div>
                    <ZipInput
                      onLocationFound={handleZipLocationFound}
                      onError={handleZipError}
                      placeholder="Enter ZIP code"
                      className="w-full sm:w-auto"
                    />
                    {zipError && (
                      <p className="text-red-500 text-sm mt-1">{zipError}</p>
                    )}
                  </div>
              
              {/* Location Button removed per server-side auto center */}
              
              {/* Mobile Filter Trigger */}
              <FilterTrigger
                isOpen={showFiltersModal}
                onToggle={() => setShowFiltersModal(!showFiltersModal)}
                activeFiltersCount={hasActiveFilters ? 1 : 0}
                className="sm:hidden"
              />
            </div>
          </div>

          {/* Sales Grid */}
          <div className="mb-6">
            {(!filters.lat || !filters.lng) ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📍</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Location unavailable. Enter a ZIP to see nearby sales.
                </h3>
                <p className="text-gray-500 mb-4">We couldn't determine your location automatically.</p>
                <div className="max-w-md mx-auto">
                  <ZipInput
                    onLocationFound={handleZipLocationFound}
                    onError={handleZipError}
                    placeholder="Enter ZIP code"
                    className="w-full"
                  />
                  {zipError && (
                    <p className="text-red-500 text-sm mt-2">{zipError}</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div
                  role="status"
                  aria-live="polite"
                  className={`${(loading || !fetchedOnce) ? 'flex' : 'hidden'} justify-center items-center py-12`}
                >
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <span className="ml-2">Loading sales...</span>
                </div>

                {!(loading || !fetchedOnce) && (
                  sales.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-500 text-lg">No sales found matching your criteria.</p>
                      <p className="text-gray-400 mt-2">Try adjusting your filters or location.</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="sales-grid">
                        {sales.map((sale) => (
                          <SaleCard key={sale.id} sale={sale} />
                        ))}
                      </div>
                      <LoadMoreButton
                        onLoadMore={loadMore}
                        hasMore={hasMore}
                        loading={loadingMore}
                      />
                    </>
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* Desktop Filters Sidebar */}
        <div className="hidden lg:block lg:w-1/3">
          <div className="sticky top-4 space-y-6">
            {/* Filters */}
            <FiltersModal 
              isOpen={true} 
              onClose={() => {}} 
              filters={{
                distance: filters.distance,
                dateRange: filters.dateRange,
                categories: filters.categories
              }}
              onFiltersChange={(newFilters) => {
                updateFilters({
                  distance: newFilters.distance,
                  dateRange: newFilters.dateRange as 'today' | 'weekend' | 'any',
                  categories: newFilters.categories
                })
              }}
            />
            
            {/* Map */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-xl font-semibold mb-4">Map View</h2>
              <div className="h-[400px] rounded-lg overflow-hidden">
                <SalesMap
                  sales={mapSales}
                  center={filters.lat && filters.lng ? { lat: filters.lat, lng: filters.lng } : 
                         initialCenter ? { lat: initialCenter.lat, lng: initialCenter.lng } : 
                         { lat: 39.8283, lng: -98.5795 }}
                  zoom={filters.lat && filters.lng ? 12 : 10}
                />
              </div>
              {/* Debug info */}
              <div className="mt-2 text-xs text-gray-500">
                Center: {filters.lat ? filters.lat.toFixed(4) : 'none'}, {filters.lng ? filters.lng.toFixed(4) : 'none'} | Pins: {mapSales.length}
                <br />
                Initial Center: {initialCenter?.lat?.toFixed(4) || 'none'}, {initialCenter?.lng?.toFixed(4) || 'none'}
              </div>
              
              {/* Location Info */}
              {filters.lat && filters.lng && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Searching within {filters.distance} miles</strong> of your location
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Found {sales.length} sales
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Filters Modal removed per UX request to avoid duplicate filters */}
      
      {/* Client-side geolocation removed to avoid browser prompts */}
    </div>
  )
}