'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { milesToKm } from '@/utils/geo'
import LoadMoreButton from '@/components/LoadMoreButton'

// Intent Arbiter types
type ControlMode = 'initial' | 'map' | 'zip' | 'distance'
interface ControlArbiter {
  mode: ControlMode
  programmaticMoveGuard: boolean
  lastChangedAt: number
}

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

  // Source of Truth Arbiter — observe-only for now
  const [arbiter, setArbiter] = useState<ControlArbiter>({ mode: 'initial', programmaticMoveGuard: false, lastChangedAt: Date.now() })

  const updateControlMode = useCallback((mode: ControlMode, reason: string) => {
    setArbiter(prev => {
      if (prev.mode === mode) return prev
      const next = { ...prev, mode, lastChangedAt: Date.now() }
      console.log(`[ARB] mode=${mode} reason=${reason} ts=${next.lastChangedAt}`)
      return next
    })
  }, [])

  const setProgrammaticMoveGuard = useCallback((on: boolean, reason: string) => {
    setArbiter(prev => {
      if (prev.programmaticMoveGuard === on) return prev
      const next = { ...prev, programmaticMoveGuard: on, lastChangedAt: Date.now() }
      console.log(`[ARB] guard=${on ? 'on' : 'off'} reason=${reason} ts=${next.lastChangedAt}`)
      return next
    })
  }, [])

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
  const [mapMarkers, setMapMarkers] = useState<{id: string; title: string; lat: number; lng: number}[]>([])
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapFadeIn, setMapFadeIn] = useState<boolean>(true)
  const [nextPageCache, setNextPageCache] = useState<Sale[] | null>(null)
  const [locationAccuracy, setLocationAccuracy] = useState<'server' | 'client' | 'fallback'>('server')
  const [bannerShown, setBannerShown] = useState<boolean>(false)
  const [lastLocSource, setLastLocSource] = useState<string | undefined>(undefined)
  const [mapCenterOverride, setMapCenterOverride] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)
  const [mapView, setMapView] = useState<{ center: { lat: number; lng: number } | null; zoom: number | null }>({ center: null, zoom: null })
  const [viewportBounds, setViewportBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null)
  const [visibleSales, setVisibleSales] = useState<Sale[]>(initialSales)
  const [fitBounds, setFitBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null)
  // Use refs instead of state to avoid re-renders
  const salesAbortRef = useRef<AbortController | null>(null)
  const markersAbortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<number | null>(null)
  const requestSeqRef = useRef<number>(0)
  const markerSeqRef = useRef<number>(0)
  const lastMarkersKeyRef = useRef<string>('')
  const pendingFitReasonRef = useRef<'zip' | 'distance' | null>(null)

  // Epsilon for center sync gating
  const EPS_CENTER = 1e-6
  const nearEq = (a: number, b: number) => Math.abs(a - b) < EPS_CENTER

  // Utility functions for value equality checks
  const isEqualCenter = useCallback((a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null, tol = 1e-6) => {
    if (!a || !b) return a === b
    return Math.abs(a.lat - b.lat) < tol && Math.abs(a.lng - b.lng) < tol
  }, [])

  const isEqualBounds = useCallback((a: { north: number; south: number; east: number; west: number } | null, b: { north: number; south: number; east: number; west: number } | null, tol = 1e-6) => {
    if (!a || !b) return a === b
    return Math.abs(a.north - b.north) < tol && Math.abs(a.south - b.south) < tol && 
           Math.abs(a.east - b.east) < tol && Math.abs(a.west - b.west) < tol
  }, [])

  const onBoundsChange = useCallback((b?: { north: number; south: number; east: number; west: number }) => {
    if (!b) return
    setViewportBounds(b)
    console.log('[VIEWPORT] bounds:', b.north, b.south, b.east, b.west)
  }, [])

  const cropSalesToViewport = useCallback((all: Sale[], b?: { north: number; south: number; east: number; west: number } | null) => {
    if (!b) return all
    const { north, south, east, west } = b
    const crossesAntimeridian = east < west
    const EPS = 0.0005 // Small epsilon for inclusive cropping
    
    const inView = all.filter(s => {
      if (s.lat === null || s.lat === undefined || s.lng === null || s.lng === undefined) return false
      
      // Use epsilon for inclusive bounds checking
      const latOk = s.lat <= north + EPS && s.lat >= south - EPS
      if (!latOk) return false
      
      if (!crossesAntimeridian) {
        return s.lng >= west - EPS && s.lng <= east + EPS
      }
      // If bounds cross the antimeridian, longitudes are either >= west OR <= east
      return s.lng >= west - EPS || s.lng <= east + EPS
    })
    console.log('[VIEWPORT] cropped', all.length, '→', inView.length)
    return inView
  }, [])

  // Approximate radius (km) from Mapbox zoom level at mid-latitudes
  const approximateRadiusKmFromZoom = useCallback((zoom?: number | null): number | null => {
    if (zoom === undefined || zoom === null) return null
    // Simple heuristic: radius halves each +1 zoom; base ~2000km at z=4
    const baseRadiusKmAtZ4 = 2000
    const delta = zoom - 4
    const radius = baseRadiusKmAtZ4 / Math.pow(2, Math.max(0, delta))
    // Clamp to reasonable search window
    return Math.min(300, Math.max(2, radius))
  }, [])

  // Compute bounding box for a center point and radius in miles
  const computeBboxForRadius = useCallback((center: { lat: number; lng: number }, radiusMiles: number) => {
    const radiusKm = milesToKm(radiusMiles)
    const latDeg = radiusKm / 111 // Approximate km per degree latitude
    const lngDeg = radiusKm / (111 * Math.cos(center.lat * Math.PI / 180)) // Adjust for longitude
    
    return {
      north: center.lat + latDeg,
      south: center.lat - latDeg,
      east: center.lng + lngDeg,
      west: center.lng - lngDeg
    }
  }, [])

  // Detect neutral fallback center (do not auto-fetch in this case)
  const isNeutralFallback = !!initialCenter && initialCenter.lat === 39.8283 && initialCenter.lng === -98.5795

  // Abort previous requests for a specific endpoint
  const abortPrevious = useCallback((endpoint: 'sales' | 'markers') => {
    if (endpoint === 'sales' && salesAbortRef.current) {
      console.log('[NET] abort sales')
      salesAbortRef.current.abort()
      salesAbortRef.current = null
    }
    if (endpoint === 'markers' && markersAbortRef.current) {
      console.log('[NET] abort markers')
      markersAbortRef.current.abort()
      markersAbortRef.current = null
    }
  }, [])

  // Build stable request key for markers
  const buildMarkersKey = useCallback(() => {
    const mode = arbiter?.mode || 'initial'
    let key = `mode:${mode}`
    
    if (mode === 'map' && mapView.center && mapView.zoom) {
      const center = mapView.center
      const radius = approximateRadiusKmFromZoom(mapView.zoom)
      key += `|center:${center.lat.toFixed(6)},${center.lng.toFixed(6)}|radius:${radius?.toFixed(2) || 'null'}`
    } else {
      key += `|lat:${filters.lat?.toFixed(6) || 'null'}|lng:${filters.lng?.toFixed(6) || 'null'}|dist:${filters.distance}`
    }
    
    key += `|date:${filters.dateRange}|cats:${filters.categories.sort().join(',')}`
    return key
  }, [arbiter.mode, mapView.center, mapView.zoom, filters.lat, filters.lng, filters.distance, filters.dateRange, filters.categories, approximateRadiusKmFromZoom])

  const fetchSales = useCallback(async (append = false, centerOverride?: { lat: number; lng: number }) => {
    // Abort previous sales request
    abortPrevious('sales')
    
    // Create fresh controller and increment sequence
    const controller = new AbortController()
    salesAbortRef.current = controller
    const seq = ++requestSeqRef.current
    
    console.log('[NET] start sales', { seq })
    
    // Determine parameters based on arbiter mode (fallback to existing behavior)
    const mode = arbiter?.mode || 'initial'
    let useLat = centerOverride?.lat ?? filters.lat
    let useLng = centerOverride?.lng ?? filters.lng
    let distanceKmForRequest: number | null = null

    if (mode === 'map' && mapView.center && mapView.zoom) {
      // Map mode: derive center from mapView and approximate radius from zoom
      useLat = mapView.center.lat
      useLng = mapView.center.lng
      const radiusKm = approximateRadiusKmFromZoom(mapView.zoom)
      distanceKmForRequest = radiusKm
      console.log('[DIST] MAP mode radius miles→km', { 
        miles: radiusKm ? radiusKm / 1.60934 : null, 
        km: radiusKm 
      })
    } else {
      // ZIP/Distance/Initial: use filters center + filters distance
      distanceKmForRequest = milesToKm(filters.distance)
    }

    console.log('[SALES] fetchSales start', { append, mode, useLat, useLng, distanceKmForRequest, filters, centerOverride })
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    console.log(`[SALES] fetchSales called with location: ${useLat}, ${useLng}, append: ${append}`)
    
    // If no location, don't try to fetch sales yet
    if (!useLat || !useLng) {
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
      lat: useLat,
      lng: useLng,
      // distanceKm depends on control mode
      distanceKm: (distanceKmForRequest ?? milesToKm(filters.distance)),
      city: filters.city,
      categories: filters.categories.length > 0 ? filters.categories : undefined,
      // Use standardized dateFrom/dateTo parameters
      ...(dateFrom ? { dateFrom: dateFrom } as any : {}),
      ...(dateTo ? { dateTo: dateTo } as any : {}),
      limit: 24,
      offset: append ? sales.length : 0,
    }
    console.log('[SALES] fetch params:', { ...params, mode })
    console.debug('[SALES] center', useLat, useLng, 'dist', filters.distance, 'date', filters.dateRange)

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
      console.debug('[SALES] fetch', `/api/sales?${queryString}`)
      const res = await fetch(`/api/sales?${queryString}`, { signal: controller.signal })
      const data = await res.json()
      
      // Check if this request was aborted
      if (requestSeqRef.current !== seq) {
        console.log('[NET] aborted sales', { seq })
        return
      }
      
      console.log('[NET] ok sales', { seq })
      console.log(`[SALES] API response:`, data)
      console.debug('[SALES] results', data.data?.length || 0)
      
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
        console.debug('[SALES] got', sales.length)

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
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[NET] aborted sales', { seq })
        return
      }
      console.error('Error fetching sales:', error)
      setSales([])
      setFetchedOnce(true)
    } finally {
      // Clear controller if this is still the active one
      if (salesAbortRef.current === controller) {
        salesAbortRef.current = null
      }
      if (append) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }, [filters.lat, filters.lng, filters.distance, filters.city, filters.categories, filters.dateRange, arbiter.mode, mapView.center, mapView.zoom, approximateRadiusKmFromZoom, abortPrevious])

  // Client-side geolocation removed; handlers not used

  // Fetch markers for map pins using dedicated markers endpoint
  const fetchMapSales = useCallback(async (centerOverride?: { lat: number; lng: number }) => {
    // Check if we need to fetch based on key change
    const key = buildMarkersKey()
    if (key === lastMarkersKeyRef.current) {
      console.log('[SKIP] same markers key')
      return
    }
    
    console.log('[KEY] markers', key)
    lastMarkersKeyRef.current = key
    
    // Abort previous markers request
    abortPrevious('markers')
    
    // Create fresh controller and increment sequence
    const controller = new AbortController()
    markersAbortRef.current = controller
    const seq = ++markerSeqRef.current
    
    console.log('[NET] start markers', { seq })
    
    const mode = arbiter?.mode || 'initial'
    let useLat = centerOverride?.lat ?? filters.lat
    let useLng = centerOverride?.lng ?? filters.lng
    let distanceKmForRequest: number | null = null

    if (mode === 'map' && mapView.center && mapView.zoom) {
      useLat = mapView.center.lat
      useLng = mapView.center.lng
      const radiusKm = approximateRadiusKmFromZoom(mapView.zoom)
      distanceKmForRequest = radiusKm
      console.log('[DIST] MAP mode radius miles→km', { 
        miles: radiusKm ? radiusKm / 1.60934 : null, 
        km: radiusKm 
      })
    } else {
      distanceKmForRequest = milesToKm(filters.distance)
    }
    if (!useLat || !useLng) return
    
    try {
      console.log('[MAP] fetchMapSales called with filters:', filters, 'centerOverride:', centerOverride)
      // Map dateRange preset to concrete ISO dates for markers
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
      params.set('lat', String(useLat))
      params.set('lng', String(useLng))
      // distanceKm depends on control mode
      const distanceKm = String(distanceKmForRequest ?? milesToKm(filters.distance))
      params.set('distanceKm', distanceKm)
      if (filters.categories.length > 0) params.set('categories', filters.categories.join(','))
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      params.set('limit', '1000')

      console.log('[MAP] Fetching markers from:', `/api/sales/markers?${params.toString()}`, { mode })
      console.debug('[MARKERS] fetch', `/api/sales/markers?${params.toString()}`)
      console.debug('[MARKERS] center', useLat, useLng, 'dist', filters.distance, 'date', filters.dateRange)
      const res = await fetch(`/api/sales/markers?${params.toString()}`, { signal: controller.signal })
      const data = await res.json()
      
      // Check if this request was aborted
      if (markerSeqRef.current !== seq) {
        console.log('[NET] aborted markers', { seq })
        return
      }
      
      console.log('[NET] ok markers', { seq })
      console.log('[MAP] Markers response:', data)
      console.debug('[MARKERS] markers', data?.data ? data.data.length : 0)
      if (data?.ok && Array.isArray(data.data)) {
        // Deduplicate markers by id to prevent duplicates
        const uniqueMarkers = data.data.filter((marker: any, index: number, self: any[]) => 
          index === self.findIndex((m: any) => m.id === marker.id)
        )
        console.log('[MAP] Setting mapMarkers to:', uniqueMarkers.length, 'markers (deduplicated from', data.data.length, ')')
        setMapMarkers(uniqueMarkers)
        setMapError(null) // Clear any previous errors
        console.debug('[MARKERS] got', uniqueMarkers.length)
      } else {
        console.log('[MAP] Setting mapMarkers to empty array')
        setMapMarkers([])
        console.debug('[MARKERS] got', 0)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[NET] aborted markers', { seq })
        return
      }
      console.error('[MAP] Error fetching markers:', error)
      setMapMarkers([])
      setMapError('Failed to load map markers')
      // Clear error after 3 seconds
      setTimeout(() => setMapError(null), 3000)
    } finally {
      // Clear controller if this is still the active one
      if (markersAbortRef.current === controller) {
        markersAbortRef.current = null
      }
    }
  }, [filters.lat, filters.lng, filters.distance, filters.categories, filters.dateRange, arbiter.mode, mapView.center, mapView.zoom, approximateRadiusKmFromZoom, abortPrevious, buildMarkersKey])

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
          distanceKm: milesToKm(filters.distance),
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

  // Debounced, single-flight fetchers with abort controllers


  // Debounced function wrapper using refs
  const debouncedTrigger = useCallback((fn: () => void, delay = 250) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = window.setTimeout(() => {
      console.log('[NET] debounce fire')
      fn()
      debounceRef.current = null
    }, delay)
  }, [])

  // Reset pagination when mode/bbox changes
  const resetPagination = useCallback(() => {
    setSales([])
    setNextPageCache(null)
    setHasMore(true)
    console.log('[NET] reset pagination')
  }, [])

  const triggerFetches = useCallback(() => {
    debouncedTrigger(() => {
      fetchSales()
      fetchMapSales()
    })
  }, [debouncedTrigger, fetchSales, fetchMapSales])

  // Debounced visible list recompute
  const listDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const recomputeVisibleSales = useCallback((all: Sale[], b: typeof viewportBounds) => {
    if (listDebounceRef.current) clearTimeout(listDebounceRef.current)
    listDebounceRef.current = setTimeout(() => {
      const inView = cropSalesToViewport(all, b)
      const rendered = inView.slice(0, 24)
      setVisibleSales(rendered)
      console.log('[LIST] update (cap=24) inView=', inView.length, 'rendered=', rendered.length)
    }, 180)
  }, [cropSalesToViewport])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Abort any in-flight requests
      if (salesAbortRef.current) {
        salesAbortRef.current.abort()
      }
      if (markersAbortRef.current) {
        markersAbortRef.current.abort()
      }
      // Clear any pending debounce timeouts
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      if (listDebounceRef.current) {
        clearTimeout(listDebounceRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const key = buildMarkersKey()
    
    // Early return if programmatic move guard is active and not in map mode
    if (arbiter.programmaticMoveGuard && arbiter.mode !== 'map') {
      console.log('[SKIP] programmatic move guard active, not in map mode')
      return
    }
    
    // Early return if key hasn't changed
    if (key === lastMarkersKeyRef.current) {
      console.log('[SKIP] same markers key')
      return
    }
    
    console.log('[SALES] Inputs changed → key:', key)
    triggerFetches()
  }, [triggerFetches, buildMarkersKey, arbiter.programmaticMoveGuard, arbiter.mode])

  // Keep visibleSales in sync with current sales and viewport
  useEffect(() => {
    recomputeVisibleSales(sales, viewportBounds)
  }, [recomputeVisibleSales, sales, viewportBounds?.north, viewportBounds?.south, viewportBounds?.east, viewportBounds?.west])

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

  // Initialize location/filters on first mount: URL (handled by hook) → sessionStorage → localStorage → cookie → /api/location
  useEffect(() => {
    if (filters.lat && filters.lng) return
    const tryInit = async () => {
      try {
        // 1) sessionStorage (last session)
        if (typeof window !== 'undefined') {
          const savedSession = sessionStorage.getItem('la_session_filters')
          if (savedSession) {
            const parsed = JSON.parse(savedSession)
            if (parsed?.lat && parsed?.lng) {
              console.log('[SALES] Restoring filters from sessionStorage')
              updateFilters({
                lat: parsed.lat,
                lng: parsed.lng,
                city: parsed.city,
                distance: parsed.distance,
                dateRange: parsed.dateRange,
                categories: parsed.categories || []
              })
              setLastLocSource('sessionStorage')
              return
            }
          }
        }
        // 2) localStorage (last visit)
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('lootaura_last_location')
          if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed?.lat && parsed?.lng) {
              console.log('[SALES] Restoring location from localStorage')
              updateFilters({ lat: parsed.lat, lng: parsed.lng, city: parsed.city, distance: parsed.distance, categories: parsed.categories || [] })
              setLastLocSource('localStorage')
              return
            }
          }
        }
        // 2) cookie
        const cookieData = getCookie('la_loc')
        if (cookieData) {
          try {
            const locationData = JSON.parse(cookieData)
            if (locationData.lat && locationData.lng) {
              console.log('[SALES] Loading location from cookie')
              updateFilters({ lat: locationData.lat, lng: locationData.lng, city: locationData.city })
            if (typeof window !== 'undefined') {
              const savedPrev = localStorage.getItem('lootaura_last_location')
              const prevObj = savedPrev ? JSON.parse(savedPrev) : {}
              localStorage.setItem('lootaura_last_location', JSON.stringify({ ...prevObj, lat: locationData.lat, lng: locationData.lng, city: locationData.city }))
            }
              setLastLocSource('cookie')
              return
            }
          } catch {}
        }
        // 3) server endpoint
        const res = await fetch('/api/location', { cache: 'no-store' })
        if (res.ok) {
          const loc = await res.json()
          if (loc?.lat && loc?.lng) {
            console.log('[SALES] Seeding location from /api/location', { source: loc.source })
            updateFilters({ lat: loc.lat, lng: loc.lng, city: loc.city })
            if (typeof window !== 'undefined') {
              const savedPrev = localStorage.getItem('lootaura_last_location')
              const prevObj = savedPrev ? JSON.parse(savedPrev) : {}
              localStorage.setItem('lootaura_last_location', JSON.stringify({ ...prevObj, lat: loc.lat, lng: loc.lng, city: loc.city }))
            }
            setLastLocSource(loc.source || 'headers')
          }
        }
      } catch {}
    }
    tryInit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist current filters to sessionStorage for restore-on-refresh
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const toStore = {
        lat: filters.lat,
        lng: filters.lng,
        city: filters.city,
        distance: filters.distance,
        dateRange: filters.dateRange,
        categories: filters.categories
      }
      sessionStorage.setItem('la_session_filters', JSON.stringify(toStore))
    } catch {}
  }, [filters.lat, filters.lng, filters.city, filters.distance, filters.dateRange, filters.categories])

  // Geolocation prompt removed by design; no client location requests

  const handleDistanceChange = useCallback((newDistance: number) => {
    console.log('[CONTROL] mode=distance (distance slider)')
    updateControlMode('distance', 'Distance slider changed')
    setProgrammaticMoveGuard(true, 'Distance fit (programmatic)')
    pendingFitReasonRef.current = 'distance'
    
    // Reset pagination for distance changes
    resetPagination()
    
    // Use current center from filters or mapView
    const currentCenter = filters.lat && filters.lng 
      ? { lat: filters.lat, lng: filters.lng }
      : mapView.center || { lat: 38.2527, lng: -85.7585 }
    
    const bbox = computeBboxForRadius(currentCenter, newDistance)
    setFitBounds(bbox)
    console.log('[MAP] fitBounds(distance)', bbox.north, bbox.south, bbox.east, bbox.west)
    
    // Update URL with new distance and current center
    updateFilters({ distance: newDistance }, false) // Update URL
    console.log('[URL] distance change -> lat,lng, dist=miles', currentCenter.lat, currentCenter.lng, newDistance)
    
    // Trigger debounced fetches
    debouncedTrigger(() => {
      fetchSales()
      fetchMapSales()
    })
  }, [filters.lat, filters.lng, mapView.center, updateControlMode, setProgrammaticMoveGuard, computeBboxForRadius, updateFilters, resetPagination, debouncedTrigger, fetchSales, fetchMapSales])

  const handleZipLocationFound = (lat: number, lng: number, city?: string, state?: string, zip?: string) => {
    setZipError(null)
    console.log(`[ZIP] submit -> ${zip} -> lat=${lat}, lng=${lng}`)
    console.log('[CONTROL] mode=zip (zip submit)')
    updateControlMode('zip', 'ZIP lookup asserted control')
    console.log('[CONTROL] programmaticMoveGuard=true (zip fit)')
    setProgrammaticMoveGuard(true, 'ZIP fit (programmatic)')
    pendingFitReasonRef.current = 'zip'
    
    // Reset pagination for ZIP changes
    resetPagination()
    
    // Update filters with new location and update URL with mode=zip
    updateFilters({
      lat,
      lng,
      city: city || undefined
    }, false) // Update URL with new lat/lng
    console.log('[URL] zip -> lat=${lat},lng=${lng},dist=${filters.distance},mode=zip')
    
    // Compute bbox from center + current distance and trigger fitBounds
    const currentCenter = { lat, lng }
    const bbox = computeBboxForRadius(currentCenter, filters.distance)
    setFitBounds(bbox)
    console.log('[ZIP] computed bbox for dist=${filters.distance} -> n=${bbox.north},s=${bbox.south},e=${bbox.east},w=${bbox.west}')
    console.log('[MAP] fitBounds(zip) north=${bbox.north}, south=${bbox.south}, east=${bbox.east}, west=${bbox.west}')
    
    // Trigger debounced fetches
    debouncedTrigger(() => {
      fetchSales()
      fetchMapSales()
    })
    
    // Persist to session/local storage
    try {
      const cookiePayload = JSON.stringify({ lat, lng, city, state, zip })
      document.cookie = `la_loc=${cookiePayload}; Max-Age=${60 * 60 * 24}; Path=/; SameSite=Lax`
      const savedPrev = localStorage.getItem('lootaura_last_location')
      const prevObj = savedPrev ? JSON.parse(savedPrev) : {}
      localStorage.setItem('lootaura_last_location', JSON.stringify({ ...prevObj, lat, lng, city }))
      
      // Also persist to sessionStorage for immediate restore
      const sessionData = {
        lat,
        lng,
        city,
        distance: filters.distance,
        dateRange: filters.dateRange,
        categories: filters.categories
      }
      sessionStorage.setItem('la_session_filters', JSON.stringify(sessionData))
    } catch {}

    // Remove old map centering logic - now using fitBounds instead
    // The fitBounds will be handled by the map component and onFitBoundsComplete
  }

  const handleZipError = (error: string) => {
    setZipError(error)
  }

  // Smooth map pin fade-in without moving center
  useEffect(() => {
    setMapFadeIn(false)
    const id = setTimeout(() => setMapFadeIn(true), 150)
    return () => clearTimeout(id)
  }, [mapSales])

  // One-time soft banner when results first load
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (bannerShown) return
    if (sales.length > 0) {
      const seen = sessionStorage.getItem('la_seen_results_banner')
      if (!seen) {
        setBannerShown(true)
        sessionStorage.setItem('la_seen_results_banner', '1')
      }
    }
  }, [sales, bannerShown])

  const handleIncreaseDistanceAndRetry = () => {
    const nextMiles = Math.min(100, filters.distance + 10)
    updateFilters({ distance: nextMiles }, true) // Skip URL update
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

          {/* Active filter chips - under search controls, above map/list */}
          {(filters.dateRange !== 'any' || filters.categories.length > 0) && (
            <div className="mt-2 overflow-x-auto whitespace-nowrap flex gap-2">
              {filters.dateRange !== 'any' && (
                <button
                  onClick={() => updateFilters({ dateRange: 'any' as any })}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full"
                >
                  {filters.dateRange === 'today' ? 'Today' : filters.dateRange === 'weekend' ? 'This Weekend' : 'Next Weekend'} ×
                </button>
              )}
              {filters.categories.map((c) => (
                <button
                  key={c}
                  onClick={() => updateFilters({ categories: filters.categories.filter(x => x !== c) })}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full"
                >
                  {c} ×
                </button>
              ))}
            </div>
          )}

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
                    <div className="text-center py-16">
                      <h3 className="text-xl font-semibold text-gray-800">No sales found nearby</h3>
                      <p className="text-gray-500 mt-2">Try expanding your search radius or changing the date range.</p>
                      <button
                        onClick={handleIncreaseDistanceAndRetry}
                        className="mt-4 inline-flex items-center px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                      >
                        Increase distance by 10 miles
                      </button>
                    </div>
                  ) : (
                    <>
                      {visibleSales.length > 24 && (
                        <div className="text-xs text-gray-600 mb-2">Showing first <strong>24</strong> of <strong>{visibleSales.length}</strong> in view</div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="sales-grid">
                        {(loading ? Array.from({ length: 6 }) : visibleSales).map((item: any, idx: number) => (
                          loading ? (
                            <div key={idx} className="animate-pulse bg-white rounded-lg border p-4">
                              <div className="h-40 bg-gray-200 rounded mb-4" />
                              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                              <div className="h-4 bg-gray-200 rounded w-1/2" />
                            </div>
                          ) : (
                            <SaleCard key={item.id} sale={item} />
                          )
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
                if (newFilters.distance !== filters.distance) {
                  handleDistanceChange(newFilters.distance)
                }
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
              <div className={`h-[400px] rounded-lg overflow-hidden transition-opacity duration-300 ${mapFadeIn ? 'opacity-100' : 'opacity-0'} relative`}>
                {/* Error toast */}
                {mapError && (
                  <div className="absolute top-2 right-2 z-10 bg-red-500 text-white px-3 py-2 rounded-md text-sm shadow-lg">
                    {mapError}
                  </div>
                )}
                <SalesMap
                  sales={mapSales}
                  markers={mapMarkers}
                  center={filters.lat && filters.lng ? { lat: filters.lat, lng: filters.lng } : 
                         initialCenter ? { lat: initialCenter.lat, lng: initialCenter.lng } : 
                         { lat: 39.8283, lng: -98.5795 }}
                  zoom={filters.lat && filters.lng ? 12 : 10}
                  centerOverride={mapCenterOverride}
                  fitBounds={fitBounds}
                  onFitBoundsComplete={() => {
                    console.log('[CONTROL] onFitBoundsComplete (guard stays true)')
                    setFitBounds(null)
                    
                    // Check if this is a pending fit we need to handle
                    if (pendingFitReasonRef.current === null) {
                      console.log('[CONTROL] fit completion already handled')
                      return
                    }
                    
                    const reason = pendingFitReasonRef.current
                    pendingFitReasonRef.current = null
                    
                    console.log(`[CONTROL] fit completion for ${reason}`)
                    // Guard stays true until next user interaction
                    // Trigger fetches once after fit completes
                    debouncedTrigger(() => {
                      fetchSales()
                      fetchMapSales()
                    })
                  }}
                  onBoundsChange={onBoundsChange}
                  onSearchArea={({ center }) => {
                    // Only update filters if we're in map mode and center changed significantly
                    if (arbiter.mode === 'map' && !arbiter.programmaticMoveGuard) {
                      const currentLat = filters.lat || 0
                      const currentLng = filters.lng || 0
                      if (!nearEq(currentLat, center.lat) || !nearEq(currentLng, center.lng)) {
                        console.log('[FILTERS] center sync gated by mode + epsilon')
                        updateFilters({ lat: center.lat, lng: center.lng }, true) // Skip URL update
                      }
                    }
                    fetchSales(false, center)
                    fetchMapSales(center)
                  }}
                  onViewChange={({ center, zoom, userInteraction }) => {
                    setMapView({ center, zoom })
                    
                    // If programmatic move guard is active, ignore all changes except user interactions
                    if (arbiter.programmaticMoveGuard && !userInteraction) {
                      console.log('[ARB] map move ignored due to guard (programmatic)')
                      return
                    }
                    
                    // Only handle user interactions
                    if (userInteraction) {
                      if (arbiter.programmaticMoveGuard) {
                        console.log('[CONTROL] user pan -> mode: zip → map; guard=false')
                        setProgrammaticMoveGuard(false, 'User interaction after ZIP')
                        updateControlMode('map', 'User panned/zoomed after ZIP')
                      } else {
                        console.log('[CONTROL] user pan detected -> switching to map mode')
                        updateControlMode('map', 'User panned/zoomed')
                      }
                    }
                    
                    try {
                      const saved = JSON.parse(localStorage.getItem('lootaura_last_location') || '{}')
                      localStorage.setItem('lootaura_last_location', JSON.stringify({ ...saved, lat: center.lat, lng: center.lng }))
                    } catch {}
                  }}
                />
              </div>
              {/* Debug info */}
              <div className="mt-2 text-xs text-gray-500">
                Center: {filters.lat ? filters.lat.toFixed(4) : 'none'}, {filters.lng ? filters.lng.toFixed(4) : 'none'} | Pins: {mapMarkers.length}
                <br />
                Initial Center: {initialCenter?.lat?.toFixed(4) || 'none'}, {initialCenter?.lng?.toFixed(4) || 'none'}
              </div>
              
              {/* Location Info & one-time soft banner */}
              {filters.lat && filters.lng && (
                <div className="mt-4 space-y-2">
                  {bannerShown && (
                    <div className="p-3 bg-amber-50 border border-amber-100 text-amber-900 rounded-md text-sm">
                      Showing sales near {filters.city || 'your location'}
                    </div>
                  )}
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Searching within {filters.distance} miles</strong> of your location
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Showing {sales.length} results
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Filters Modal removed per UX request to avoid duplicate filters */}
      
      {/* Client-side geolocation removed to avoid browser prompts */}

      {/* Developer-only geolocation debug panel */}
      {typeof window !== 'undefined' && searchParams.get('debug') === 'geo' && process.env.NODE_ENV !== 'production' && (
        <div className="fixed bottom-4 left-4 z-50 bg-white/95 backdrop-blur border rounded-md shadow px-3 py-2 text-xs text-gray-700 space-y-1">
          <div><strong>Lat/Lng:</strong> {filters.lat?.toFixed(4) || '—'}, {filters.lng?.toFixed(4) || '—'}</div>
          <div><strong>City:</strong> {filters.city || '—'}</div>
          <div><strong>Source:</strong> {lastLocSource || '—'}</div>
          <div><strong>Schema:</strong> public.sales_v2</div>
          <div><strong>Degraded:</strong> {degraded ? 'true' : 'false'}</div>
        </div>
      )}
    </div>
  )
}