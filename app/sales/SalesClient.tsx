'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import { GetSalesParams } from '@/lib/data/sales'
import SalesMap from '@/components/location/SalesMap'
import ZipInput from '@/components/location/ZipInput'
import SaleCard from '@/components/SaleCard'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import FiltersModal from '@/components/filters/FiltersModal'
import FilterTrigger from '@/components/filters/FilterTrigger'
import DateWindowLabel from '@/components/filters/DateWindowLabel'
import DegradedBanner from '@/components/DegradedBanner'
import { useFilters } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'
import { milesToKm } from '@/utils/geo'
import LoadMoreButton from '@/components/LoadMoreButton'
import DiagnosticOverlay from '@/components/DiagnosticOverlay'
import { diagnosticFetch, emitSuppressedFetch } from '@/lib/diagnostics/fetchWrapper'
import salesListDebug from '@/lib/debug/salesListDebug'
import { normalizeFilters, filtersEqual, createCategoriesKey } from '@/lib/shared/categoryNormalizer'
import LayoutDiagnostic from '@/components/LayoutDiagnostic'
import GridLayoutDiagnostic from '@/components/GridLayoutDiagnostic'
import GridDebugOverlay from '@/components/GridDebugOverlay'
import { resolveDatePreset } from '@/lib/shared/resolveDatePreset'

// Intent Arbiter types
type ControlMode = 'initial' | 'map' | 'zip' | 'distance'
type AuthorityMode = 'FILTERS' | 'MAP'

interface ControlArbiter {
  mode: ControlMode
  authority: 'FILTERS' | 'MAP'  // Simplified authority tracking
  programmaticMoveGuard: boolean
  guardMapMove: boolean  // Strict guard to prevent automatic map movement
  lastChangedAt: number
  lastTransitionReason: string
}

interface QueryShape {
  lat: number
  lng: number
  radiusKm: number
  dateRange: string
  categories: string[]
  shapeHash: string
}

interface _MapViewState {
  center: { lat: number; lng: number }
  bounds: { west: number; south: number; east: number; north: number }
  zoom: number
  radiusKm: number
}

// Arbiter helper functions
function createShapeHash(lat: number, lng: number, radiusKm: number, dateRange: string, categories: string[]): string {
  const catKey = categories.sort().join(',')
  const dateKey = dateRange === 'any' ? 'any' : dateRange
  return `${lat.toFixed(6)}|${lng.toFixed(6)}|${radiusKm.toFixed(2)}|${dateKey}|${catKey}`
}

function computeRadiusFromZoom(zoom: number): number {
  // Approximate radius in km based on zoom level
  const baseRadius = 40 // Default 40km (25 miles)
  const zoomFactor = Math.pow(2, 12 - zoom) // Zoom 12 = 40km
  return Math.max(1, Math.min(160, baseRadius * zoomFactor))
}

function _computeRadiusFromBounds(bounds: { west: number; south: number; east: number; north: number }): number {
  // Approximate radius from bounds using center and corner distance
  const centerLat = (bounds.north + bounds.south) / 2
  const centerLng = (bounds.east + bounds.west) / 2
  const cornerLat = bounds.north
  const cornerLng = bounds.east
  
  // Simple distance calculation (not haversine, but good enough for radius approximation)
  const latDiff = cornerLat - centerLat
  const lngDiff = cornerLng - centerLng
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111 // Rough km conversion
  
  return Math.max(1, Math.min(160, distance))
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

export default function SalesClient({ initialSales, initialSearchParams: _initialSearchParams, initialCenter, user: _user }: SalesClientProps) {
  // Debug flag for console checkpoints
  const DEBUG = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG === 'true'
  
  // Container mount checkpoint
  useEffect(() => {
    if (DEBUG) {
      console.log('[DOM][LIST] container mounted')
      
      // One-time computed-style debug for grid layout
      setTimeout(() => {
        const listContainer = document.querySelector('[data-panel="list"]')
        if (listContainer) {
          const computedStyle = window.getComputedStyle(listContainer)
          const display = computedStyle.display
          const gtc = computedStyle.gridTemplateColumns
          const parent = listContainer.parentElement
          const parentDisplay = parent ? window.getComputedStyle(parent).display : 'none'
          const parentWidth = parent ? window.getComputedStyle(parent).width : '0px'
          console.log(`[DOM][LIST] grid display=${display} gtc=${gtc} parentDisplay=${parentDisplay} parentWidth=${parentWidth}`)
        }
      }, 100) // Small delay to ensure styles are applied
    }
  }, [DEBUG])
  
  // Category change detection ref
  const prevCategoriesKeyRef = useRef<string>('')
  
  // List store sequence for UI updates
  const listStoreSeqRef = useRef<number>(0)
  const prevVisibleIdsHashRef = useRef<string>('')
  
  // Markers change signal for list updates
  const markersHashRef = useRef<string>('')
  const _router = useRouter()
  const searchParams = useSearchParams()
  const { filters, updateFilters, hasActiveFilters } = useFilters(
    initialCenter?.lat && initialCenter?.lng ? { lat: initialCenter.lat, lng: initialCenter.lng } : undefined
  )

  // Source of Truth Arbiter — observe-only for now
  const [arbiter, setArbiter] = useState<ControlArbiter>({ 
    mode: 'initial', 
    authority: 'MAP',
    programmaticMoveGuard: false,
    guardMapMove: false,  // Start with guard disabled
    lastChangedAt: Date.now(),
    lastTransitionReason: 'initial'
  })
  
  // Mode authority locking to prevent thrashing
  const mapAuthorityUntilRef = useRef<number>(0)
  
  // Track last resolved date range to prevent unnecessary fetches
  const _lastResolvedDateRangeRef = useRef<{ from?: string; to?: string } | null>(null)
  
  // Idempotency guard to prevent ping-pong when results are repeatedly "0"
  const lastApplyStateRef = useRef<{
    bboxHash: string
    dateKey: string
    markerIds: string
  } | null>(null)
  
  // Circuit breaker for visible pins to prevent re-render loops
  const lastVisiblePinsRef = useRef<string[]>([])
  
  // Stable date key for effect dependencies
  const dateKey = useMemo(() => {
    const resolved = resolveDatePreset(filters.dateRange)
    const key = (resolved?.from || '') + '|' + (resolved?.to || '')
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[DATEKEY] computed:', { preset: filters.dateRange, resolved, key })
    }
    return key
  }, [filters.dateRange])
  
  // Stable bbox hash for effect dependencies (moved after viewportBounds declaration)
  
  // Diagnostic overlay state
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === '1'

  const updateControlMode = useCallback((mode: ControlMode, reason: string) => {
    setArbiter(prev => {
      if (prev.mode === mode) return prev
      const next = { ...prev, mode, lastChangedAt: Date.now(), lastTransitionReason: reason }
      console.log(`[ARB] mode=${mode} reason=${reason} ts=${next.lastChangedAt}`)
      return next
    })
  }, [])

  const setAuthority = useCallback((authority: AuthorityMode, reason: string) => {
    setArbiter(prev => {
      if (prev.authority === authority) return prev
      const next = { ...prev, authority, lastChangedAt: Date.now(), lastTransitionReason: reason }
      console.log(`[ARB] authority=${authority} reason=${reason} ts=${next.lastChangedAt}`)
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

  // Helper to switch to map mode only if user gesture (not programmatic)
  const switchToMapIfUserGesture = useCallback((reason: string) => {
    if (arbiter.programmaticMoveGuard) {
      console.log('[ARB] switch to map blocked (guard active)')
      return
    }
    // Immediate authority flip; no debounce, no lock
    updateControlMode('map', reason)
    setAuthority('MAP', reason)
    console.log('[ARB] authority=MAP (immediate) reason=' + reason)
  }, [arbiter.programmaticMoveGuard, updateControlMode, setAuthority])

  const setGuardMapMove = useCallback((on: boolean, reason: string) => {
    setArbiter(prev => {
      if (prev.guardMapMove === on) return prev
      const next = { ...prev, guardMapMove: on, lastChangedAt: Date.now() }
      console.log(`[ARB] mapGuard=${on ? 'on' : 'off'} reason=${reason} ts=${next.lastChangedAt}`)
      return next
    })
  }, [])

  // Map view state (needed before getEffectiveQueryShape)
  const [mapView, setMapView] = useState<{ center: { lat: number; lng: number } | null; zoom: number | null }>({ center: null, zoom: null })

  // Helper to create state key for request identity
  const createStateKey = useCallback((mode: string, center: {lat: number, lng: number}, radiusKm: number, dateRange: string, categories: string[]) => {
    const catKey = categories.sort().join(',')
    const dateKey = dateRange === 'any' ? 'any' : dateRange
    return `${mode}|${center.lat.toFixed(6)},${center.lng.toFixed(6)}|${radiusKm.toFixed(2)}|${dateKey}|${catKey}`
  }, [])

  // Get effective query shape based on current authority
  const _getEffectiveQueryShape = useCallback((): QueryShape => {
    const dateRange = filters.dateRange === 'any' ? 'any' : filters.dateRange
    const categories = filters.categories || []
    
    if (arbiter.authority === 'MAP') {
      // Use current map center and viewport-derived radius
      const center = mapView.center || { lat: filters.lat || 0, lng: filters.lng || 0 }
      const radiusKm = mapView.zoom ? computeRadiusFromZoom(mapView.zoom) : milesToKm(filters.distance || 25)
      const shapeHash = createShapeHash(center.lat, center.lng, radiusKm, dateRange, categories)
      return { lat: center.lat, lng: center.lng, radiusKm, dateRange, categories, shapeHash }
    } else {
      // Use filter values (slider-driven)
      const center = { lat: filters.lat || 0, lng: filters.lng || 0 }
      const radiusKm = milesToKm(filters.distance || 25)
      const shapeHash = createShapeHash(center.lat, center.lng, radiusKm, dateRange, categories)
      return { lat: center.lat, lng: center.lng, radiusKm, dateRange, categories, shapeHash }
    }
  }, [arbiter.authority, filters, mapView])


  const [sales, setSales] = useState<Sale[]>(initialSales)
  const [loading, setLoading] = useState(false)
  const [fetchedOnce, setFetchedOnce] = useState(false)
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [dateWindow, setDateWindow] = useState<any>(null)
  const [degraded, setDegraded] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mapUpdating, setMapUpdating] = useState(false)
  // Delay showing the "updating map" overlay to avoid flashes during quick pans/zooms
  const mapUpdatingTimerRef = useRef<number | null>(null)
  // Safety timeout to ensure overlay never lingers too long
  const mapUpdatingMaxRef = useRef<number | null>(null)
  const [mapSales, _setMapSales] = useState<Sale[]>([])
  const [mapMarkers, setMapMarkers] = useState<{id: string; title: string; lat: number; lng: number}[]>([])
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapFadeIn, setMapFadeIn] = useState<boolean>(true)
  
  // Request tokening system
  const [requestToken, setRequestToken] = useState<string>('')
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [visiblePinIdsState, setVisiblePinIdsState] = useState<string[]>([])
  const [nextPageCache, setNextPageCache] = useState<Sale[] | null>(null)
  const [_locationAccuracy, _setLocationAccuracy] = useState<'server' | 'client' | 'fallback'>('server')
  const [bannerShown, setBannerShown] = useState<boolean>(false)
  const [lastLocSource, setLastLocSource] = useState<string | undefined>(undefined)
  const [mapCenterOverride, _setMapCenterOverride] = useState<{ lat: number; lng: number; zoom?: number; reason?: string } | null>(null)
  const [viewportBounds, setViewportBounds] = useState<{ north: number; south: number; east: number; west: number; ts: number } | null>(null)
  
  // Stable bbox hash for effect dependencies
  const bboxHash = useMemo(() => {
    if (!viewportBounds) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[BBOXHASH] no bounds')
      }
      return 'no-bounds'
    }
    const hash = `${viewportBounds.north},${viewportBounds.south},${viewportBounds.east},${viewportBounds.west}`
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[BBOXHASH] computed:', hash)
    }
    return hash
  }, [viewportBounds])
  const lastBoundsTsRef = useRef<number | null>(null)
  const [visibleSales, setVisibleSales] = useState<Sale[]>(initialSales)
  const [fitBounds, setFitBounds] = useState<{ north: number; south: number; east: number; west: number; reason?: string } | null>(null)
  const [isUpdating, setIsUpdating] = useState<boolean>(false)
  const [staleSales, setStaleSales] = useState<Sale[]>(initialSales) // Keep previous data during fetch
  const [renderedSales, setRenderedSales] = useState<Sale[]>(initialSales) // Sales visible on map
  // Use refs instead of state to avoid re-renders
  const salesAbortRef = useRef<AbortController | null>(null)
  const markersAbortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<number | null>(null)
  const markerSeqRef = useRef<number>(0)
  const _mapModeDebounceRef = useRef<NodeJS.Timeout | null>(null)
  
  // Request identity and stale-response guard
  const salesReqIdRef = useRef<number>(0)
  const markersReqIdRef = useRef<number>(0)
  const currentSalesRequestRef = useRef<{reqId: number, stateKey: string} | null>(null)
  // Epoch guard to drop stale responses when filters change
  const filtersEpochRef = useRef(0)
  const currentMarkersRequestRef = useRef<{reqId: number, stateKey: string} | null>(null)
  
  // Arbiter sequencing for latest-wins behavior
  const viewportSeqRef = useRef<number>(0)
  const requestSeqRef = useRef<number>(0)
  
  // In-flight tracking and versioning
  const [_inFlightSales, _setInFlightSales] = useState<boolean>(false)
  const [_inFlightMarkers, _setInFlightMarkers] = useState<boolean>(false)
  const markersVersionRef = useRef<number>(0)
  const latestBoundsTsRef = useRef<number>(0)
  const _visibilityComputeKeyRef = useRef<string>('')
  const _lastVisibleIdsRef = useRef<string[]>([])
  const _visibilityComputeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Map stability and idle tracking
  const [_mapReady, _setMapReady] = useState<boolean>(false)
  const _firstStableViewportTsRef = useRef<number>(0)
  
  // Debug logging
  console.log('[SALES] SalesClient render:', {
    initialCenter,
    filters,
    searchParams: Object.fromEntries(searchParams.entries()),
    salesCount: sales.length,
    markersCount: mapMarkers.length,
    authority: arbiter.authority,
    mode: arbiter.mode,
    loading,
    hasMore,
    visibleSalesCount: visibleSales.length,
    renderedSalesCount: renderedSales.length,
    staleSalesCount: staleSales.length
  })
  const lastViewportEmitTsRef = useRef<number>(0)
  const boundsCoalesceKeyRef = useRef<string>('')
  const boundsDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingBoundsRef = useRef<{ north: number; south: number; east: number; west: number; ts: number } | null>(null)
  const _pendingStableTimerRef = useRef<NodeJS.Timeout | null>(null)
  const latestBoundsKeyRef = useRef<string>('')

  // Helper to create bounds coalesce key
  const createBoundsKey = useCallback((bounds: { north: number; south: number; east: number; west: number }) => {
    const round = (n: number) => Math.round(n * 1000000) / 1000000 // 6 decimal places
    return `${round(bounds.north)},${round(bounds.south)},${round(bounds.east)},${round(bounds.west)}`
  }, [])


  // Debounced bounds emission (leading + trailing)
  const emitBoundsDebounced = useCallback((bounds: { north: number; south: number; east: number; west: number; ts: number }) => {
    const boundsKey = createBoundsKey(bounds)
    const now = Date.now()
    
    // Skip if same key within 150ms
    if (boundsKey === boundsCoalesceKeyRef.current && now - lastViewportEmitTsRef.current < 150) {
      return
    }
    
    // Check area change < 1% and center delta < epsilon
    const currentBounds = viewportBounds
    if (currentBounds) {
      const areaChange = Math.abs((bounds.north - bounds.south) * (bounds.east - bounds.west) - 
                                 (currentBounds.north - currentBounds.south) * (currentBounds.east - currentBounds.west)) / 
                        ((currentBounds.north - currentBounds.south) * (currentBounds.east - currentBounds.west))
      const centerLat = (bounds.north + bounds.south) / 2
      const centerLng = (bounds.east + bounds.west) / 2
      const currentCenterLat = (currentBounds.north + currentBounds.south) / 2
      const currentCenterLng = (currentBounds.east + currentBounds.west) / 2
      const centerDelta = Math.sqrt(Math.pow(centerLat - currentCenterLat, 2) + Math.pow(centerLng - currentCenterLng, 2))
      
      if (areaChange < 0.01 && centerDelta < 0.0001) { // ~10 meters
        return
      }
    }
    
    // Clear any pending debounce
    if (boundsDebounceTimeoutRef.current) {
      clearTimeout(boundsDebounceTimeoutRef.current)
    }
    
    // Store pending bounds
    pendingBoundsRef.current = bounds
    boundsCoalesceKeyRef.current = boundsKey
    
    // Leading: emit immediately if first or after long gap
    if (lastViewportEmitTsRef.current === 0 || now - lastViewportEmitTsRef.current > 150) {
      // Only update viewport clock on accepted viewport emits
      lastViewportEmitTsRef.current = now
      latestBoundsTsRef.current = bounds.ts
      latestBoundsKeyRef.current = boundsKey
      // Increment viewport seq and log
      viewportSeqRef.current += 1
      console.log(`[VIEWPORT] seq=${viewportSeqRef.current} key=${boundsKey} accepted at ts=${now}`)
      setViewportBounds(bounds)
    }
    
    // Trailing: emit after 100ms if no newer bounds arrive
    boundsDebounceTimeoutRef.current = setTimeout(() => {
      if (pendingBoundsRef.current === bounds) {
        // Only update viewport clock on accepted viewport emits
        lastViewportEmitTsRef.current = Date.now()
        latestBoundsTsRef.current = bounds.ts
        latestBoundsKeyRef.current = boundsKey
        viewportSeqRef.current += 1
        console.log(`[VIEWPORT] seq=${viewportSeqRef.current} key=${boundsKey} accepted (trailing) ts=${Date.now()}`)
        setViewportBounds(bounds)
      }
      boundsDebounceTimeoutRef.current = null
    }, 100)
  }, [viewportBounds, createBoundsKey])

  // Unified fetch function with request identity and stale-response guard
  const _fetchWithToken = useCallback(async (endpoint: 'sales' | 'markers', queryShape: QueryShape) => {
    // Generate request identity
    const reqId = endpoint === 'sales' ? ++salesReqIdRef.current : ++markersReqIdRef.current
    const stateKey = createStateKey(arbiter.mode, {lat: queryShape.lat, lng: queryShape.lng}, queryShape.radiusKm, queryShape.dateRange, queryShape.categories)
    
    // Store current request
    const currentRequest = {reqId, stateKey}
    if (endpoint === 'sales') {
      currentSalesRequestRef.current = currentRequest
    } else {
      currentMarkersRequestRef.current = currentRequest
    }

    // Cancel previous request
    if (abortController) {
      abortController.abort()
      console.log(`[NET] abort previous request for ${endpoint}`)
    }

    // Create new request token
    const newToken = `${endpoint}-${queryShape.shapeHash}-${Date.now()}`
    setRequestToken(newToken)
    setIsUpdating(true)
    
    // Set in-flight flags (don't clear arrays)
    if (endpoint === 'sales') {
      _setInFlightSales(true)
    } else {
      _setInFlightMarkers(true)
    }

    // Create new abort controller
    const newController = new AbortController()
    setAbortController(newController)

    try {
      const params = new URLSearchParams()
      params.set('lat', String(queryShape.lat))
      params.set('lng', String(queryShape.lng))
      params.set('distanceKm', String(queryShape.radiusKm))
      params.set('dateRange', String(queryShape.dateRange))
      if (Array.isArray(queryShape.categories) && queryShape.categories.length > 0) {
        params.set('categories', queryShape.categories.join(','))
      }
      const url = endpoint === 'sales'
        ? `/api/sales?${params.toString()}`
        : `/api/sales/markers?${params.toString()}`

      console.log(`[NET] start ${endpoint} {seq: ${reqId}} key=${stateKey}`)
      
      const response = await fetch(url, { signal: newController.signal })
      const data = await response.json()

      // Check if this request is still current
      const currentRequestRef = endpoint === 'sales' ? currentSalesRequestRef : currentMarkersRequestRef
      if (!currentRequestRef.current || currentRequestRef.current.reqId !== reqId) {
        console.log(`[NET] ok ${endpoint} {seq: ${reqId}} but dropped (stale key=${stateKey}, current=${currentRequestRef.current?.stateKey || 'none'})`)
        return
      }

      if (data.ok) {
        console.log(`[NET] ok ${endpoint} {seq: ${reqId}}`)
        
        if (endpoint === 'sales') {
          // Atomic commit: set sales then schedule visibility computation
          setSales(data.data || [])
          _setInFlightSales(false)
          // Schedule visibility computation on next animation frame
          requestAnimationFrame(() => {
            // Visibility will be recomputed by the markers change handler
          })
        } else {
          // Increment markers version for identity tracking
          markersVersionRef.current++
          const newMarkers = data.data || []
          const markerIds = newMarkers.map((m: any) => m.id).sort().join(',')
          
          // Idempotency guard: skip if bbox, date, and marker IDs haven't changed
          const currentState = { bboxHash, dateKey, markerIds }
          const lastState = lastApplyStateRef.current
          
          console.log('[MARKERS] idempotency check:', { 
            current: currentState, 
            last: lastState,
            bboxMatch: lastState?.bboxHash === currentState.bboxHash,
            dateMatch: lastState?.dateKey === currentState.dateKey,
            markersMatch: lastState?.markerIds === currentState.markerIds
          })
          
          if (lastState && 
              lastState.bboxHash === currentState.bboxHash &&
              lastState.dateKey === currentState.dateKey &&
              lastState.markerIds === currentState.markerIds) {
            console.log('[MARKERS] idempotent apply - skipping update (same bbox|date|markers)')
            _setInFlightMarkers(false)
            return
          }
          
          setMapMarkers(newMarkers)
          _setInFlightMarkers(false)
          lastApplyStateRef.current = currentState
          console.log(`[MARKERS] set: ${newMarkers.length} version: ${markersVersionRef.current}`)
          
          // Dev-only verification logging
          if (process.env.NEXT_PUBLIC_DEBUG === '1') {
            console.log(`[MARKERS][apply] count=${newMarkers.length} vSeq=${viewportSeqRef.current} dropped=false`)
          }
        }
      } else {
        console.error(`[NET] error ${endpoint}:`, data.error)
        // Clear in-flight flags on error
        if (endpoint === 'sales') {
          _setInFlightSales(false)
        } else {
          _setInFlightMarkers(false)
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`[NET] aborted ${endpoint} {seq: ${reqId}}`)
        return
      }
      console.error(`[NET] error ${endpoint}:`, error)
    } finally {
      // Only clear updating state if this is still the current request
      if (requestToken === newToken) {
        setIsUpdating(false)
        setAbortController(null)
        // Clear in-flight flags
        if (endpoint === 'sales') {
          _setInFlightSales(false)
        } else {
          _setInFlightMarkers(false)
        }
      }
    }
  }, [abortController, requestToken, arbiter.mode, createStateKey])
  const lastMarkersKeyRef = useRef<string>('')
  const pendingFitReasonRef = useRef<'zip' | 'distance' | null>(null)

  // Epsilon for center sync gating
  const EPS_CENTER = 1e-6
  const nearEq = (a: number, b: number) => Math.abs(a - b) < EPS_CENTER

  // Utility functions for value equality checks
  const _isEqualCenter = useCallback((a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null, tol = 1e-6) => {
    if (!a || !b) return a === b
    return Math.abs(a.lat - b.lat) < tol && Math.abs(a.lng - b.lng) < tol
  }, [])

  const _isEqualBounds = useCallback((a: { north: number; south: number; east: number; west: number } | null, b: { north: number; south: number; east: number; west: number } | null, tol = 1e-6) => {
    if (!a || !b) return a === b
    return Math.abs(a.north - b.north) < tol && Math.abs(a.south - b.south) < tol && 
           Math.abs(a.east - b.east) < tol && Math.abs(a.west - b.west) < tol
  }, [])

  const onBoundsChange = useCallback((b?: { north: number; south: number; east: number; west: number; ts: number }) => {
    if (!b) return
    // Use debounced emission instead of immediate emission
    emitBoundsDebounced(b)
  }, [emitBoundsDebounced])

  const onMapReady = useCallback(() => {
    _setMapReady(true)
    console.log('[MAP] ready - will emit bounds only on idle')
  }, [])

  const _getVisibleSalesFromRenderedFeatures = useCallback((all: Sale[]) => {
    // This function will be called from the map component with queryRenderedFeatures results
    // For now, return all sales - this will be updated when we implement the map integration
    return all
  }, [])

  const cropSalesToViewport = useCallback((all: Sale[], b?: { north: number; south: number; east: number; west: number; ts: number } | null) => {
    if (!b) return all
    
    const { north, south, east, west } = b
    const crossesAntimeridian = east < west
    const EPS = 0.0005 // Small epsilon for inclusive cropping
    
    // Remove padding to avoid an invisible margin where pins disappear at edges
    const padding = 0 // previously 0.05 (~5%)
    const latRange = north - south
    const lngRange = crossesAntimeridian ? (180 - west) + (east + 180) : east - west
    const paddedNorth = north + (latRange * padding)
    const paddedSouth = south - (latRange * padding)
    const paddedEast = east + (lngRange * padding)
    const paddedWest = west - (lngRange * padding)
    
    const inView = all.filter(s => {
      if (s.lat === null || s.lat === undefined || s.lng === null || s.lng === undefined) return false
      
      // Use padded bounds for inclusive cropping
      const latOk = s.lat <= paddedNorth + EPS && s.lat >= paddedSouth - EPS
      if (!latOk) return false
      
      if (!crossesAntimeridian) {
        return s.lng >= paddedWest - EPS && s.lng <= paddedEast + EPS
      }
      // If bounds cross the antimeridian, longitudes are either >= west OR <= east
      return s.lng >= paddedWest - EPS || s.lng <= paddedEast + EPS
    })
    console.log('[VIEWPORT] cropped', all.length, '→', inView.length, `(seq=${viewportSeqRef.current} key=${latestBoundsKeyRef.current})`)
    return inView
  }, [])

  // Visible list policy
  // - In MAP authority, derive from the exact visible ids provided by the map (no duplicate geo-filter)
  // - Otherwise, fall back to cropping sales by viewport
  useEffect(() => {
    const seq = viewportSeqRef.current
    if (arbiter.authority === 'MAP') {
      const ids = visiblePinIdsState
      
      // Circuit breaker: skip if visible pins haven't changed (using hash for better change detection)
      const idsString = ids.sort().join(',')
      const lastIdsString = lastVisiblePinsRef.current.sort().join(',')
      if (idsString === lastIdsString) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[LIST] visible pins unchanged - skipping effect to prevent loop')
        }
        return
      }
      lastVisiblePinsRef.current = [...ids]
      
      const haveInDict = ids.filter(id => !!mapMarkers.find(m => String(m.id) === String(id))).length
      const missing = ids.filter(id => !mapMarkers.find(m => String(m.id) === String(id))).slice(0, 3)
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[LIST][MAP] seq=${seq} ids.count=${ids.length} sample=${ids.slice(0,3)} haveInDict=${haveInDict} missing=${missing}`)
      }

      // If we have no visible pins, that's fine - just return empty
      if (ids.length === 0) {
        setVisibleSales([])
        setRenderedSales([])
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log(`[LIST] update (map) seq=${seq} markers=${ids.length} inView=0 rendered=0`)
        }
        return
      }

      // If visible pins don't match current markers, let the map recalculate naturally
      // Don't clear visible pins here as it prevents the map from recalculating them
      if (haveInDict === 0) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log(`[LIST][MAP] visible pins don't match current markers - waiting for map to recalculate`)
        }
        setVisibleSales([])
        setRenderedSales([])
        return
      }

      // Build minimal items from markers immediately; hydrate from sales cache if present
      const minimal = ids.map(id => {
        const m = mapMarkers.find(mm => String(mm.id) === String(id))
        return {
          id: String(id),
          title: m?.title || 'Sale',
          address: '',
          city: '',
          state: '',
          zip_code: '',
          lat: m?.lat,
          lng: m?.lng,
          date_start: null,
          time_start: null,
          date_end: null,
          time_end: null,
          photos: [],
        } as unknown as Sale
      })
      const byId: Record<string, Sale> = {}
      for (const s of sales) byId[String(s.id)] = s
      const hydrated = minimal.map(s => byId[String(s.id)] ?? s)
      const rendered = hydrated.slice(0, 24)
      salesListDebug.logVisibleRendered('MAP', {
        visibleCount: hydrated.length,
        renderedCount: rendered.length,
        sampleVisible: hydrated.slice(0, 3).map((s: any) => ({ id: s.id, title: s.title }))
      })
      setVisibleSales(hydrated)
      setRenderedSales(rendered)
      
      // List store update with sequence tracking
      const currentIdsHash = hydrated.map(s => s.id).sort().join(',')
      const idsChanged = prevVisibleIdsHashRef.current !== currentIdsHash
      
      if (idsChanged) {
        listStoreSeqRef.current += 1
        prevVisibleIdsHashRef.current = currentIdsHash
      }
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[LIST][DIFF] seq=${listStoreSeqRef.current} idsHash=${currentIdsHash.slice(0, 20)}... prevSeq=${listStoreSeqRef.current - 1} changed=${idsChanged}`)
        console.log(`[LIST] apply visible count=${hydrated.length} seq=${listStoreSeqRef.current} idsHash=${currentIdsHash.slice(0, 20)}...`)
      }
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[LIST] update (map) seq=${seq} markers=${ids.length} inView=${hydrated.length} rendered=${rendered.length}`)
      }
    } else if (viewportBounds) {
      console.log('[SALES LIST] FILTERS authority with viewportBounds:', {
        viewportBounds,
        salesCount: sales.length,
        authority: arbiter.authority
      })
      const inView = cropSalesToViewport(sales, viewportBounds)
      const rendered = inView.slice(0, 24)
      salesListDebug.logVisibleRendered('FILTERS', {
        visibleCount: inView.length,
        renderedCount: rendered.length,
        sampleVisible: inView.slice(0, 3).map((s: any) => ({ id: s.id, title: s.title }))
      })
      setVisibleSales(inView)
      setRenderedSales(rendered)
      
      // List store update with sequence tracking
      const currentIdsHash = inView.map(s => s.id).sort().join(',')
      const idsChanged = prevVisibleIdsHashRef.current !== currentIdsHash
      
      if (idsChanged) {
        listStoreSeqRef.current += 1
        prevVisibleIdsHashRef.current = currentIdsHash
      }
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[LIST][DIFF] seq=${listStoreSeqRef.current} idsHash=${currentIdsHash.slice(0, 20)}... prevSeq=${listStoreSeqRef.current - 1} changed=${idsChanged}`)
        console.log(`[LIST] apply visible count=${inView.length} seq=${listStoreSeqRef.current} idsHash=${currentIdsHash.slice(0, 20)}...`)
      }
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[LIST] update (filters) seq=${seq} inView=${inView.length} rendered=${rendered.length}`)
      }
    } else {
      console.log('[SALES LIST] No viewportBounds for FILTERS authority:', {
        viewportBounds,
        salesCount: sales.length,
        authority: arbiter.authority,
        mode: arbiter.mode
      })
      
      // FALLBACK: For FILTERS authority without viewport bounds, use all sales directly
      console.log('[SALES LIST] Checking fallback conditions:', {
        authority: arbiter.authority,
        authorityIsFILTERS: arbiter.authority === 'FILTERS',
        salesLength: sales.length,
        salesLengthGT0: sales.length > 0,
        shouldExecuteFallback: arbiter.authority === 'FILTERS' && sales.length > 0
      })
      
      if (arbiter.authority === 'FILTERS' && sales.length > 0) {
        console.log('[SALES LIST] FILTERS fallback - using all sales directly')
        const rendered = sales.slice(0, 24)
        console.log('[SALES LIST] FILTERS fallback setting:', {
          visibleCount: sales.length,
          renderedCount: rendered.length,
          sampleSales: sales.slice(0, 3).map(s => ({ id: s.id, title: s.title }))
        })
        setVisibleSales(sales)
        setRenderedSales(rendered)
      } else {
        console.log('[SALES LIST] Fallback not executed - conditions not met')
      }
    }
  }, [arbiter.authority, visiblePinIdsState, mapMarkers, sales, viewportBounds, cropSalesToViewport])

  // DOM-count assertion for MAP list
  useEffect(() => {
    if (arbiter.authority !== 'MAP') return
    
    // Check for sales list container - use the actual panel selector
    const listContainer = document.querySelector('[data-panel="list"]')
    if (!listContainer) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[DOM][LIST] MISSING container (BUG)')
        console.error('[DOM] no [data-panel="list"] found - sales list container missing')
      }
      return
    }
    
    // Use descendant query for structure-proof counting
    const cardsInPanel = listContainer.querySelectorAll('[data-card="sale"]').length
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[DOM][LIST] cards in panel=${cardsInPanel} expected=${visiblePinIdsState.length}`)
    }
    
  }, [arbiter.authority, viewportBounds?.north, viewportBounds?.south, viewportBounds?.east, viewportBounds?.west, visiblePinIdsState.length])

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

  // Build stable request key for markers (optionally using override center/zoom during active moves)
  const buildMarkersKey = useCallback((override?: { center?: { lat: number; lng: number }; zoom?: number }) => {
    const mode = arbiter?.mode || 'initial'
    let key = `mode:${mode}`
    
    if (mode === 'map' && mapView.center && mapView.zoom) {
      const center = override?.center ?? mapView.center
      const zoomForRadius = override?.zoom ?? mapView.zoom
      const radius = approximateRadiusKmFromZoom(zoomForRadius)
      key += `|center:${center.lat.toFixed(6)},${center.lng.toFixed(6)}|radius:${radius?.toFixed(2) || 'null'}`
    } else {
      key += `|lat:${filters.lat?.toFixed(6) || 'null'}|lng:${filters.lng?.toFixed(6) || 'null'}|dist:${filters.distance}`
    }
    
    key += `|date:${filters.dateRange}|cats:${filters.categories.sort().join(',')}`
    return key
  }, [arbiter.mode, mapView.center, mapView.zoom, filters.lat, filters.lng, filters.distance, filters.dateRange, filters.categories, approximateRadiusKmFromZoom])

  const fetchSales = useCallback(async (append: boolean = false, centerOverride?: { lat: number; lng: number }) => {
    // Abort previous sales request
    abortPrevious('sales')
    
    // Create fresh controller and increment sequence
    const controller = new AbortController()
    salesAbortRef.current = controller
    const seq = ++requestSeqRef.current
    
    console.log('[NET] start sales', { seq, mode: arbiter.authority, viewportSeq: viewportSeqRef.current })
    
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

    console.log('[SALES] fetchSales start', { append, mode, useLat, useLng, distanceKmForRequest, filters, centerOverride, epoch: filtersEpochRef.current })
    setLoading(true)
    setIsUpdating(true)
    setStaleSales(sales)
    console.log(`[SALES] fetchSales called with location: ${useLat}, ${useLng}, append: ${append}`)
    
    // If no location, don't try to fetch sales yet
    if (!useLat || !useLng) {
      console.log('[SALES] No location provided, waiting for location')
      // Don't clear sales immediately to prevent flickering
      // setSales([])
      setDateWindow(null)
      setDegraded(false)
      setHasMore(true)
      if (append) setLoadingMore(false); else setLoading(false)
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
    
    // Debug list payload
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const listPayload = {
        lat: useLat,
        lng: useLng,
        distanceKm: distanceKmForRequest ?? milesToKm(filters.distance),
        city: filters.city,
        categories: filters.categories.length > 0 ? filters.categories : undefined,
        dateFrom,
        dateTo,
        limit: 24,
        offset: append ? sales.length : 0
      }
      console.log('[FILTER DEBUG] listPayload =', listPayload)
      
      // Assertion: if categories are selected, ensure they're in the payload
      if (filters.categories.length > 0 && !listPayload.categories) {
        console.error('[FILTER DEBUG] ERROR: Categories selected but not included in list payload!')
      }
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
      // HARD GUARD: Suppress wide /api/sales under MAP authority
      if (arbiter.authority === 'MAP') {
        console.log('[GUARD] Suppressed wide /api/sales under MAP authority')
        
        // Warning: Check if categories are present but list is suppressed
        if (process.env.NEXT_PUBLIC_DEBUG === 'true' && filters.categories.length > 0) {
          console.warn('[FILTER DEBUG] WARNING: Categories present but list fetch suppressed under MAP authority')
          console.warn('[FILTER DEBUG] Ensure markers query includes same category filters')
        }
        
        // Dev-only verification logging
        if (process.env.NEXT_PUBLIC_DEBUG === '1') {
          console.log(`[SALES][suppressed] wide fetch blocked under MAP authority vSeq=${viewportSeqRef.current}`)
        }
        
        emitSuppressedFetch('/api/sales', Object.fromEntries(
          Object.entries(params).map(([key, value]) => [key, String(value)])
        ), {
          authority: arbiter.authority,
          viewportSeq: viewportSeqRef.current,
          requestSeq: seq
        })
        return
      }

      console.log(`[SALES] Fetching from: /api/sales?${queryString}`)
      console.debug('[SALES] fetch', `/api/sales?${queryString}`)
      
      const res = await diagnosticFetch(`/api/sales?${queryString}`, { signal: controller.signal }, {
        authority: arbiter.authority,
        viewportSeq: viewportSeqRef.current,
        requestSeq: seq,
        params: Object.fromEntries(
          Object.entries(params).map(([key, value]) => [key, String(value)])
        )
      })
      const data = await res.json()
      
      // Check if this request was aborted
      if (requestSeqRef.current !== seq) {
        console.log('[DROP] stale response sales (seq mismatch)', { seq, current: requestSeqRef.current })
        return
      }
      // Epoch guard handled by markers path that triggers this fetch
      
      console.log('[NET] ok sales', { seq, mode: arbiter.authority, viewportSeq: viewportSeqRef.current })
      console.log(`[SALES] API response:`, data)
      console.debug('[SALES] results', data.data?.length || 0)
      
      // Debug response count
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[FILTER DEBUG] response.count =', data.count || data.data?.length || 0)
        
        // List container and ID parity checks
        const listContainer = document.querySelector('[data-testid="sales-grid"]')
        if (!listContainer) {
          console.error('[LIST DEBUG] ERROR: Sales list container missing!')
        } else {
          console.log('[LIST DEBUG] Sales list container found')
        }
        
        // Check ID parity between markers and list
        const visibleIds = data.data?.slice(0, 5).map((sale: any) => sale.id) || []
        const listIds = Array.from(document.querySelectorAll('[data-sale-id]')).map(el => el.getAttribute('data-sale-id'))
        const sampleIdParity = visibleIds.reduce((acc: any, id: string) => {
          acc[id] = listIds.includes(id)
          return acc
        }, {})
        
        console.log('[LIST DEBUG] ID parity check:', {
          markersCount: data.data?.length || 0,
          sampleIdParity,
          listCount: listIds.length
        })
      }
      
      if (data.ok) {
        const newSales = data.data || []
        // If in MAP authority, do not let wide/broad results overwrite map-scoped list
        if ((arbiter.authority as string) === 'MAP') {
          console.log('[DROP] stale/wide response (MAP authority active)')
          return
        }
        // Debug sales data before setting
        salesListDebug.logSalesData('Setting sales data', {
          salesCount: newSales.length,
          hasMore: newSales.length === 24,
          sampleSales: newSales.slice(0, 3).map((s: any) => ({ id: s.id, title: s.title })),
          authority: arbiter.authority,
          append
        })
        
        console.log('[SALES LIST] Setting sales data (detailed):')
        console.log('  - salesCount:', newSales.length)
        console.log('  - hasMore:', newSales.length === 24)
        console.log('  - sampleSales:', newSales.slice(0, 3).map((s: any) => ({ id: s.id, title: s.title })))
        console.log('  - authority:', arbiter.authority)
        console.log('  - append:', append)
        console.log('  - currentSalesCount:', sales.length)
        console.log('  - currentRenderedCount:', renderedSales.length)
        console.log('  - currentVisibleCount:', visibleSales.length)
        
        setSales(newSales)
        setIsUpdating(false)
        setDateWindow(data.dateWindow || null)
        setDegraded(data.degraded || false)
        const pageHasMore = newSales.length === 24
        setHasMore(pageHasMore)
        console.log(`[SALES] ${append ? 'Appended' : 'Set'} ${newSales.length} sales, hasMore: ${pageHasMore}`)
        console.debug('[SALES] got', sales.length)
        
        // Debug after setting sales
        console.log('[SALES LIST] After setting sales:')
        console.log('  - newSalesCount:', newSales.length)
        console.log('  - currentSalesCount:', sales.length)
        console.log('  - renderedSalesCount:', renderedSales.length)
        console.log('  - visibleSalesCount:', visibleSales.length)
        console.log('  - authority:', arbiter.authority)

        // Prefetch next page in background for instant next click
        // Note: safe here because MAP authority already returned above
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
            .catch((error) => {
              console.warn('Sales fetch error:', error)
            })
        }
      } else {
        console.error('Sales API error:', data.error)
        if (!append) {
          // Don't clear sales immediately to prevent flickering
          // setSales([])
          setIsUpdating(false)
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
      // Don't clear sales immediately to prevent flickering
      // setSales([])
      setIsUpdating(false)
      setFetchedOnce(true)
    } finally {
      // Clear controller if this is still the active one
      if (salesAbortRef.current === controller) {
        salesAbortRef.current = null
      }
      setLoading(false)
    }
  }, [filters.lat, filters.lng, filters.distance, filters.city, filters.categories, filters.dateRange, arbiter.mode, mapView.center, mapView.zoom, approximateRadiusKmFromZoom, abortPrevious])

  // Client-side geolocation removed; handlers not used

  // Fetch markers for map pins using dedicated markers endpoint
  const fetchMapSales = useCallback(async (startEpoch?: number, centerOverride?: { lat: number; lng: number }, zoomOverride?: number) => {
    // Check if we need to fetch based on key change (use overrides when provided)
    const key = buildMarkersKey(centerOverride ? { center: centerOverride, zoom: zoomOverride } : undefined)
    
    // During user interactions, be more aggressive about fetching even if key is similar
    const isUserInteraction = centerOverride !== undefined
    if (!isUserInteraction && key === lastMarkersKeyRef.current) {
      console.log('[SKIP] same markers key')
      return
    }
    
    console.log('[KEY] markers', key, isUserInteraction ? '(user interaction)' : '')
    lastMarkersKeyRef.current = key
    
    // Delay the updating overlay slightly to avoid opacity flashes on quick interactions
    if (typeof window !== 'undefined') {
      if (mapUpdatingTimerRef.current) {
        window.clearTimeout(mapUpdatingTimerRef.current)
        mapUpdatingTimerRef.current = null
      }
      mapUpdatingTimerRef.current = window.setTimeout(() => {
        setMapUpdating(true)
        // Start a max-duration timer to auto-clear overlay if fetch bounces
        if (mapUpdatingMaxRef.current) {
          window.clearTimeout(mapUpdatingMaxRef.current)
        }
        mapUpdatingMaxRef.current = window.setTimeout(() => {
          setMapUpdating(false)
          mapUpdatingMaxRef.current = null
        }, 400)
      }, 100)
    } else {
      setMapUpdating(true)
    }
    
    // Abort previous markers request
    abortPrevious('markers')
    
    // Create fresh controller and increment sequence
    const controller = new AbortController()
    markersAbortRef.current = controller
    const seq = ++markerSeqRef.current
    const startedEpoch = filtersEpochRef.current
    
    // For cluster clicks, don't abort too aggressively to ensure sales data loads
    const _isClusterClick = centerOverride !== undefined
    
    console.log('[NET] start markers', { seq, epoch: startedEpoch })
    
    const mode = arbiter?.mode || 'initial'
    let useLat = centerOverride?.lat ?? filters.lat
    let useLng = centerOverride?.lng ?? filters.lng
    let distanceKmForRequest: number | null = null

    if (mode === 'map' && mapView.center && mapView.zoom) {
      const center = centerOverride ?? mapView.center
      const zoomForRadius = zoomOverride ?? mapView.zoom
      useLat = center.lat
      useLng = center.lng
      const radiusKm = approximateRadiusKmFromZoom(zoomForRadius)
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
      
      // Debug category filter flow
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[FILTER DEBUG] selectedCategories =', filters.categories)
        console.log('[FILTER DEBUG] arbiter.authority =', arbiter.authority)
        console.log('[FILTER DEBUG] suppressed =', arbiter.authority === 'MAP' ? 'false (markers allowed)' : 'true (list suppressed)')
      }
      
      // Resolve dateRange preset to concrete dates
      console.log('[MAP] Resolving dateRange:', filters.dateRange)
      const resolvedDates = resolveDatePreset(filters.dateRange)
      console.log('[MAP] Resolved dates:', resolvedDates)
      
      // Test the function directly
      const testToday = resolveDatePreset('today')
      console.log('[MAP] Test today resolution:', testToday)
      const dateFrom = resolvedDates?.from
      const dateTo = resolvedDates?.to
      
      // Dev-only verification logging
      if (process.env.NEXT_PUBLIC_DEBUG === '1') {
        const nowLocalISO = new Date().toISOString().slice(0, 10)
        console.log(`[PRESET] nowLocalISO=${nowLocalISO} from=${dateFrom || 'none'} to=${dateTo || 'none'} preset=${filters.dateRange}`)
      }

      const params = new URLSearchParams()
      params.set('lat', String(useLat))
      params.set('lng', String(useLng))
      // distanceKm depends on control mode
      const distanceKm = String(distanceKmForRequest ?? milesToKm(filters.distance))
      params.set('distanceKm', distanceKm)
      // Always include categories parameter for consistency
      params.set('categories', filters.categories.join(','))
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[NET][markers] mode=${mode} cats=${filters.categories.join(',')}`)
      }
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      params.set('limit', '1000')
      
      // Debug markers payload
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const markersPayload = {
          lat: useLat,
          lng: useLng,
          distanceKm: distanceKm,
          categories: filters.categories,
          from: dateFrom,
          to: dateTo,
          limit: '1000'
        }
        console.log('[FILTER DEBUG] markersPayload =', markersPayload)
        
        // Assertion: if categories are selected, ensure they're in the markers payload
        if (filters.categories.length > 0 && (!markersPayload.categories || markersPayload.categories.length === 0)) {
          console.error('[FILTER DEBUG] ERROR: Categories selected but not included in markers payload!')
        }
      }
      

      console.log('[MAP] Fetching markers from:', `/api/sales/markers?${params.toString()}`, { mode })
      console.log('[MAP] Date parameters being sent:', { from: dateFrom, to: dateTo, dateRange: filters.dateRange })
      
      // Debug: Verify categories are included in the markers request
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const categoriesParam = params.get('categories')
        console.log('[FILTER DEBUG] Markers request categories param:', categoriesParam)
        console.log('[FILTER DEBUG] Markers request full URL:', `/api/sales/markers?${params.toString()}`)
      }
      
      // Test with a hardcoded date to verify the pipeline works
      if (filters.dateRange === 'any') {
        console.log('[MAP] Testing date pipeline with hardcoded today...')
        const testParams = new URLSearchParams()
        testParams.set('lat', String(useLat))
        testParams.set('lng', String(useLng))
        testParams.set('distanceKm', distanceKm)
        testParams.set('from', '2025-10-11')
        testParams.set('to', '2025-10-11')
        testParams.set('limit', '1000')
        console.log('[MAP] Test URL would be:', `/api/sales/markers?${testParams.toString()}`)
      }
      console.debug('[MARKERS] fetch', `/api/sales/markers?${params.toString()}`)
      console.debug('[MARKERS] center', useLat, useLng, 'dist', filters.distance, 'date', filters.dateRange)
      
      // Dev-only verification logging
      if (process.env.NEXT_PUBLIC_DEBUG === '1') {
        console.log(`[MARKERS][dispatch] bbox=<${useLat},${useLng}> from=${dateFrom || 'none'} to=${dateTo || 'none'} authority=${arbiter.authority} vSeq=${viewportSeqRef.current}`)
      }
      
      const res = await diagnosticFetch(`/api/sales/markers?${params.toString()}`, { signal: controller.signal }, {
        authority: arbiter.authority,
        viewportSeq: viewportSeqRef.current,
        requestSeq: seq,
        params: Object.fromEntries(params.entries())
      })
      const data = await res.json()
      
      // Also fetch sales data for the sales list (with separate abort controller)
      console.log('[MAP] Fetching sales data for map view...')
      const salesController = new AbortController()
      const salesRes = await diagnosticFetch(`/api/sales?${params.toString()}`, { signal: salesController.signal }, {
        authority: arbiter.authority,
        viewportSeq: viewportSeqRef.current,
        requestSeq: seq,
        params: Object.fromEntries(params.entries())
      })
      const salesData = await salesRes.json()
      
      // Check if this request was aborted
      if (markerSeqRef.current !== seq) {
        console.log('[NET] aborted markers', { seq })
        // Even if markers were aborted, try to set sales data if we have it
        if (salesData?.data && Array.isArray(salesData.data)) {
          console.log('[MAP] Setting mapSales after abort:', salesData.data.length, 'sales')
          _setMapSales(salesData.data)
          // Also update the main sales state so the sales list updates
          setSales(salesData.data)
          
          // Note: onVisiblePinsChange will be triggered by useEffect when mapSales changes
        }
        return
      }
      if (filtersEpochRef.current !== startedEpoch) {
        console.log('[DROP] stale response markers (epoch mismatch)', { startedEpoch, current: filtersEpochRef.current })
        return
      }
      if (startEpoch !== undefined && filtersEpochRef.current !== startEpoch) {
        console.log('[DROP] stale response markers (epoch mismatch)', { startEpoch, current: filtersEpochRef.current })
        return
      }
      
      console.log('[NET] ok markers', { seq })
      console.log('[MAP] Markers response:', data)
      console.debug('[MARKERS] markers', data?.data ? data.data.length : 0)
      
      // Debug response count
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[FILTER DEBUG] response.count =', data.count || data.data?.length || 0)
      }
      // Handle both direct array response and wrapped response
      const markersData = data?.data || data
      if (Array.isArray(markersData)) {
        // Normalize id to a stable value (prefer saleId if present), then deduplicate
        const normalized = markersData.map((m: any) => {
          const stableId = m.id ?? m.saleId
          return { id: String(stableId), saleId: String(stableId), title: m.title, lat: m.lat, lng: m.lng }
        })
        const uniqueMarkers = normalized.filter((marker: any, index: number, self: any[]) => 
          index === self.findIndex((m: any) => m.id === marker.id)
        )
        console.log('[MAP] Setting mapMarkers to:', uniqueMarkers.length, 'markers (deduplicated from', markersData.length, ')')
        const sample = uniqueMarkers.slice(0, 5).map((m: any) => m.id === m.saleId)
        console.log('[ASSERT] id parity ok? examples:', sample)
        setMapMarkers(uniqueMarkers)
        
        // Also set the sales data for the sales list
        if (salesData?.data && Array.isArray(salesData.data)) {
          console.log('[MAP] Setting mapSales to:', salesData.data.length, 'sales')
          _setMapSales(salesData.data)
          // Also update the main sales state so the sales list updates
          setSales(salesData.data)
          
          // Note: onVisiblePinsChange will be triggered by useEffect when mapSales changes
        } else {
          console.log('[MAP] No sales data received, setting mapSales to empty array')
          _setMapSales([])
          setSales([])
        }
        
        setMapError(null) // Clear any previous errors
        // Clear any pending timer and hide overlay immediately on success
        if (mapUpdatingTimerRef.current) {
          window.clearTimeout(mapUpdatingTimerRef.current)
          mapUpdatingTimerRef.current = null
        }
        if (mapUpdatingMaxRef.current) {
          window.clearTimeout(mapUpdatingMaxRef.current)
          mapUpdatingMaxRef.current = null
        }
        setMapUpdating(false) // Reset map updating state
        
        // Update markers hash for change detection
        const newMarkersHash = uniqueMarkers.map((m: any) => m.id).sort().join(',')
        const markersChanged = markersHashRef.current !== newMarkersHash
        markersHashRef.current = newMarkersHash
        
        if (process.env.NEXT_PUBLIC_DEBUG === 'true' && markersChanged) {
          console.log(`[MAP][MARKERS] changed size=${uniqueMarkers.length}`)
        }
        
        console.debug('[MARKERS] got', uniqueMarkers.length)
      } else {
        console.log('[MAP] Setting mapMarkers to empty array')
        setMapMarkers([])
        // Clear any pending timer and hide overlay on empty
        if (mapUpdatingTimerRef.current) {
          window.clearTimeout(mapUpdatingTimerRef.current)
          mapUpdatingTimerRef.current = null
        }
        if (mapUpdatingMaxRef.current) {
          window.clearTimeout(mapUpdatingMaxRef.current)
          mapUpdatingMaxRef.current = null
        }
        setMapUpdating(false) // Reset map updating state
        
        // Update markers hash for change detection
        const newMarkersHash = ''
        const markersChanged = markersHashRef.current !== newMarkersHash
        markersHashRef.current = newMarkersHash
        
        if (process.env.NEXT_PUBLIC_DEBUG === 'true' && markersChanged) {
          console.log(`[MAP][MARKERS] changed size=0`)
        }
        
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
      // Clear any pending timer and hide overlay on error
      if (mapUpdatingTimerRef.current) {
        window.clearTimeout(mapUpdatingTimerRef.current)
        mapUpdatingTimerRef.current = null
      }
      if (mapUpdatingMaxRef.current) {
        window.clearTimeout(mapUpdatingMaxRef.current)
        mapUpdatingMaxRef.current = null
      }
      setMapUpdating(false) // Reset map updating state
      
      // Update markers hash for change detection
      const newMarkersHash = ''
      const markersChanged = markersHashRef.current !== newMarkersHash
      markersHashRef.current = newMarkersHash
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true' && markersChanged) {
        console.log(`[MAP][MARKERS] changed size=0 (error)`)
      }
      // Clear error after 3 seconds
      setTimeout(() => setMapError(null), 3000)
    } finally {
      // Clear controller if this is still the active one
      if (markersAbortRef.current === controller) {
        markersAbortRef.current = null
      }
      // Always reset map updating state and clear any pending timer
      if (mapUpdatingTimerRef.current) {
        window.clearTimeout(mapUpdatingTimerRef.current)
        mapUpdatingTimerRef.current = null
      }
      if (mapUpdatingMaxRef.current) {
        window.clearTimeout(mapUpdatingMaxRef.current)
        mapUpdatingMaxRef.current = null
      }
      setMapUpdating(false)
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
          .catch((error) => {
            console.warn('Markers fetch error:', error)
          })
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
      // Gate wide fetches while in MAP authority
      if (arbiter.authority === 'MAP') {
        console.log('[SKIP] debounce fire suppressed (MAP authority; require viewport-scoped request)')
      } else {
        console.log('[NET] debounce fire')
        fn()
      }
      debounceRef.current = null
    }, delay)
  }, [arbiter.authority])

  // Immediate markers fetch while user is moving the map (no debouncing for real-time updates)
  const fetchMarkersDuringMove = useCallback((center: { lat: number; lng: number }) => {
    // Fetch immediately for real-time updates
    fetchMapSales(undefined, center)
  }, [fetchMapSales])

  // Reset pagination when mode/bbox changes
  const resetPagination = useCallback(() => {
    // Don't clear sales immediately to prevent flickering
    // Keep previous sales visible during fetch
    setNextPageCache(null)
    setHasMore(true)
    console.log('[NET] reset pagination (keeping previous sales)')
  }, [])

  const triggerFetches = useCallback(() => {
    console.log('[TRIGGER] triggerFetches called - DEPLOYMENT TEST')
    
    // Category change detection
    const currentCategoriesKey = createCategoriesKey(filters.categories)
    const categoriesChanged = prevCategoriesKeyRef.current !== currentCategoriesKey
    
    if (DEBUG && categoriesChanged) {
      console.log(`[FILTERS] cats norm prev=${prevCategoriesKeyRef.current} next=${currentCategoriesKey} changed=true`)
    }
    
    // Bump sequence on category changes to force UI updates
    if (categoriesChanged) {
      listStoreSeqRef.current += 1
      filtersEpochRef.current += 1
      if (DEBUG) {
        console.log(`[LIST][CATEGORY] seq bumped to ${listStoreSeqRef.current} epoch=${filtersEpochRef.current} (category change)`)
      }
    }
    
    prevCategoriesKeyRef.current = currentCategoriesKey
    
    // For MAP authority, check if we can suppress list fetch
    if (arbiter.authority === 'MAP') {
      // Build the filter sets that would be used for list and markers
      const listFilters = normalizeFilters({
        categories: filters.categories,
        city: filters.city,
        dateRange: filters.dateRange
      })
      
      const markersFilters = normalizeFilters({
        categories: filters.categories,
        city: filters.city,
        dateRange: filters.dateRange
      })
      
      // Check if filters are identical
      const equalFilters = filtersEqual(listFilters, markersFilters)
      
      // Split decisions: network vs UI updates
      const shouldSkipNetwork = equalFilters && !categoriesChanged
      const shouldUpdateUI = categoriesChanged || !equalFilters
      
      if (DEBUG) {
        console.log(`[ARB] evaluate mapAuth=true shouldSkipNetwork=${shouldSkipNetwork} shouldUpdateUI=${shouldUpdateUI}`)
      }
      
      // Debug suppression decision
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[FILTER DEBUG] normalizedFilters =', { categories: listFilters.categories })
        console.log('[FILTER DEBUG] suppression_decision =', {
          authority: arbiter.authority,
          equalFilters,
          suppressed: shouldSkipNetwork,
          listFilters,
          markersFilters
        })
      }
      
      console.log('[NET] start markers {seq: 1} (MAP authority)', { epoch: filtersEpochRef.current })
      fetchMapSales()
      
      // Only suppress network fetch if filters are identical and no category change
      if (shouldSkipNetwork) {
        console.log('[FILTER DEBUG] Suppressing list fetch - markers include identical filters')
      } else {
        console.log('[FILTER DEBUG] Allowing list fetch - filters differ or categories changed')
        // Force a one-shot list fetch when categories changed or filters not equal
        debouncedTrigger(() => {
          console.log('[NET] start sales {seq: 1, mode: "MAP-override"}', { epoch: filtersEpochRef.current })
          fetchSales(false)
        })
      }
      
      // Warning: Check if categories are present but list is suppressed under MAP authority
      if (process.env.NEXT_PUBLIC_DEBUG === 'true' && filters.categories.length > 0) {
        console.warn('[FILTER DEBUG] WARNING: Categories present but list fetch suppressed under MAP authority')
        console.warn('[FILTER DEBUG] Ensure markers query includes same category filters')
      }
    } else {
      debouncedTrigger(() => {
        console.log('[NET] start sales {seq: 1, mode: \'FILTERS\'}')
        fetchSales(false)
        fetchMapSales()
      })
    }
  }, [debouncedTrigger, fetchSales, fetchMapSales, arbiter.authority, filters.categories, filters.city, filters.dateRange])

  // Debounced visible list recompute

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
    }
  }, [])

  // Counter to track how many times this effect runs
  const effectRunCountRef = useRef(0)
  
  // Layout diagnostic ref
  const gridContainerRef = useRef<HTMLDivElement>(null)
  
  // Grid layout diagnostic (gated by NEXT_PUBLIC_DEBUG)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true' && gridContainerRef.current && visibleSales.length > 0) {
      const container = gridContainerRef.current
      const computedStyle = window.getComputedStyle(container)
      const parent = container.parentElement
      const firstCard = container.querySelector('.sale-row')
      
      // Parse grid template columns to detect column count
      const gridTemplate = computedStyle.gridTemplateColumns
      const colsDetected = gridTemplate.includes('repeat') ? 
        gridTemplate.match(/repeat\((\d+)/)?.[1] || 'unknown' : 
        gridTemplate.split(' ').length
      
      // Determine breakpoint
      const width = container.offsetWidth
      const breakpoint = width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'
      
      console.log('[GRID DEBUG] Container Analysis:', {
        display: computedStyle.display,
        gridTemplateColumns: gridTemplate,
        gap: computedStyle.gap,
        width: computedStyle.width,
        clientWidth: container.clientWidth,
        offsetWidth: container.offsetWidth,
        className: container.className,
        classList: Array.from(container.classList),
        colsDetected,
        breakpoint,
        windowWidth: window.innerWidth,
        salesCount: visibleSales.length,
        // Additional debugging
        computedGridTemplateColumns: computedStyle.gridTemplateColumns,
        computedDisplay: computedStyle.display,
        computedGap: computedStyle.gap,
        computedWidth: computedStyle.width,
        computedMaxWidth: computedStyle.maxWidth,
        computedMinWidth: computedStyle.minWidth,
        // Check for wrapper issues
        directChildren: container.children.length,
        firstChild: container.firstElementChild?.tagName,
        firstChildClasses: container.firstElementChild?.className
      })
      
      if (parent) {
        const parentStyle = window.getComputedStyle(parent)
        console.log('[GRID DEBUG] Parent Container:', {
          display: parentStyle.display,
          flexDirection: parentStyle.flexDirection,
          width: parentStyle.width,
          parentWidth: parent.offsetWidth,
          overflow: parentStyle.overflow
        })
      }
      
      if (firstCard && firstCard instanceof HTMLElement) {
        const cardStyle = window.getComputedStyle(firstCard)
        console.log('[GRID DEBUG] First Card:', {
          display: cardStyle.display,
          width: cardStyle.width,
          cardWidth: firstCard.offsetWidth,
          margin: cardStyle.margin
        })
      }
      
      // Check for multiple column-defining classes
      const columnClasses = container.className.match(/(?:^|\s)(?:grid-cols-\d+|auto-cols-)/g)
      if (columnClasses && columnClasses.length > 1) {
        console.warn('[GRID DEBUG] Multiple column classes detected:', columnClasses)
      }
    }
  }, [visibleSales.length])
  
  useEffect(() => {
    effectRunCountRef.current++
    console.log(`[EFFECT] Main effect run #${effectRunCountRef.current}`)
    
    // Use stable keys instead of buildMarkersKey to prevent identity churn
    const stableKey = `${bboxHash}|${dateKey}|${arbiter.mode}`
    
    // Debug category changes
    if (DEBUG && filters.categories.length > 0) {
      console.log(`[EFFECT] Categories changed:`, filters.categories)
    }
    
    // Early return if programmatic move guard is active and not in map mode
    if (arbiter.programmaticMoveGuard && arbiter.mode !== 'map') {
      console.log('[SKIP] programmatic move guard active, not in map mode')
      return
    }
    
    // Early return if key hasn't changed
    if (stableKey === lastMarkersKeyRef.current) {
      console.log('[SKIP] same stable key')
      return
    }
    
    console.log('[SALES] Stable inputs changed → key:', stableKey)
    lastMarkersKeyRef.current = stableKey
    triggerFetches()
  }, [bboxHash, dateKey, arbiter.mode, arbiter.programmaticMoveGuard, filters.categories, filters.city, filters.dateRange])

  // Keep visibleSales in sync with current sales and viewport
  useEffect(() => {
    // Defer crop until we have real bounds; avoid cropping against null/old bounds
    if (!viewportBounds) return
    const _now = Date.now()
    const _last = lastBoundsTsRef.current || 0
    // Visibility is now handled by the main useEffect
  }, [sales, viewportBounds?.north, viewportBounds?.south, viewportBounds?.east, viewportBounds?.west])

  // Note: MAP authority markers fetch is handled by the main effect above via triggerFetches()

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
          } catch (error) {
            console.warn('Location cookie parse error:', error)
          }
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
      } catch (error) {
        console.warn('Location initialization error:', error)
      }
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
    } catch (error) {
      console.warn('Session storage error:', error)
    }
  }, [filters.lat, filters.lng, filters.city, filters.distance, filters.dateRange, filters.categories])

  // Geolocation prompt removed by design; no client location requests

  const handleDistanceChange = useCallback((newDistance: number) => {
    console.log('[CONTROL] mode=distance (distance slider)')
    updateControlMode('distance', 'Distance slider changed')
    setProgrammaticMoveGuard(true, 'Distance fit (programmatic)')
    pendingFitReasonRef.current = 'distance'
    
    // Reset pagination for distance changes
    resetPagination()
    
    // CRITICAL: Use current viewport center (after user pan), not initial filters center
    const currentCenter = mapView.center && mapView.center.lat && mapView.center.lng
      ? { lat: mapView.center.lat, lng: mapView.center.lng }
      : (filters.lat && filters.lng 
        ? { lat: filters.lat, lng: filters.lng }
        : (() => {
            console.error('CRITICAL: No location data available - this should not happen')
            throw new Error('No location data available')
          })())
    
    console.log('[DIST] center used for fetch: lat=' + currentCenter.lat + ', lng=' + currentCenter.lng + ' (from viewport)')
    console.log('[DIST] radius miles→km {miles:' + newDistance + ', km:' + milesToKm(newDistance) + '}')
    
    const bbox = computeBboxForRadius(currentCenter, newDistance)
    
    // Switch to FILTERS authority for distance changes
    setAuthority('FILTERS', 'Distance filter changed')
    
    // Allow a single-use zoom operation for distance changes
    // This bypasses the guard by clearing it temporarily
    setGuardMapMove(false, 'Distance change - allow zoom')
    
    setFitBounds(bbox)
    console.log('[DIST-ZOOM] applied for radius=' + newDistance + ', center fixed at (' + currentCenter.lat + ',' + currentCenter.lng + ')')
    
    // Update URL with new distance and current center
    updateFilters({ 
      distance: newDistance,
      lat: currentCenter.lat,
      lng: currentCenter.lng
    }, false)
    
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
    setAuthority('FILTERS', 'ZIP search takes control') // Set authority to FILTERS for ZIP searches
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
    
    // ZIP searches should always move the map, regardless of current state
    // Clear any existing guards for ZIP searches
    setGuardMapMove(false, 'ZIP search - allow movement')
    console.log('[MAP] ZIP search - clearing guards to allow map movement')
    
    setFitBounds({ ...bbox, reason: 'zip' })
    console.log('[ZIP] computed bbox for dist=${filters.distance} -> n=${bbox.north},s=${bbox.south},e=${bbox.east},w=${bbox.west}')
    console.log('[MAP] fitBounds(zip) north=${bbox.north}, south=${bbox.south}, east=${bbox.east}, west=${bbox.west}')
    
    // Trigger debounced fetches with the new coordinates
    debouncedTrigger(() => {
      fetchSales(false, { lat, lng })
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
    } catch (error) {
      console.warn('Session storage error:', error)
    }

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

  // Update visibleSales when mapSales changes (for cluster clicks)
  useEffect(() => {
    if (mapSales.length > 0) {
      console.log('[MAP] Updating visibleSales from mapSales:', mapSales.length, 'sales')
      console.log('[MAP] DEBUG: Before update - visibleSales:', visibleSales.length, 'renderedSales:', renderedSales.length, 'staleSales:', staleSales.length)
      setVisibleSales(mapSales)
      setRenderedSales(mapSales)
      setStaleSales(mapSales) // Also update staleSales to ensure it shows even if isUpdating is true
      console.log('[MAP] DEBUG: After update - visibleSales:', mapSales.length, 'renderedSales:', mapSales.length, 'staleSales:', mapSales.length)
    }
  }, [mapSales])

  // Force mapSales to be updated when new sales data is fetched
  useEffect(() => {
    if (sales.length > 0 && arbiter.authority === 'MAP') {
      console.log('[MAP] Force updating mapSales with new sales data:', sales.length, 'sales')
      _setMapSales(sales)
    }
  }, [sales, arbiter.authority])

  const handleIncreaseDistanceAndRetry = () => {
    const nextMiles = Math.min(100, filters.distance + 10)
    updateFilters({ distance: nextMiles }, true) // Skip URL update
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <div className="lg:w-3/4">
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
                className="md:hidden"
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
                {/* Show spinner only for non-MAP authority or when no visible pins in MAP mode */}
                <div
                  role="status"
                  aria-live="polite"
                  className={`${(loading || !fetchedOnce) && (arbiter.authority !== 'MAP' || visiblePinIdsState.length === 0) ? 'flex' : 'hidden'} justify-center items-center py-12`}
                >
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <span className="ml-2">Loading sales...</span>
                </div>

                {/* Sales list grid container - single source of truth */}
                <div
                  ref={gridContainerRef}
                  className={`w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${
                    arbiter.authority === 'MAP' 
                      ? (mapUpdating ? 'opacity-50' : 'opacity-100')
                      : (loading ? 'opacity-75' : 'opacity-100')
                  }`}
                  style={{
                    // MAP authority specific styles only
                    ...(arbiter.authority === 'MAP' ? {
                      position: 'relative',
                      zIndex: 3,
                      minHeight: 240
                    } : {}),
                    // Prevent scroll anchoring jumps when content reflows
                    overflowAnchor: 'none'
                  }}
                  data-testid="sales-grid"
                  data-panel="list"
                  {...(process.env.NEXT_PUBLIC_DEBUG === 'true' && { 'data-grid-debug': 'true' })}
                  // Always use stable key to prevent unmounting
                  key="sales-list-stable"
                >
                  {/* Debug overlay - only in development with NEXT_PUBLIC_DEBUG */}
                  {process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG === 'true' && (
                    <div style={{ position:'absolute', top:8, right:8, padding:'4px 6px', fontSize:12, background:'rgba(0,255,0,.6)', zIndex:1000 }}>
                      GRID: {visibleSales.length} sales
                      <br />
                      W: {typeof window !== 'undefined' ? window.innerWidth : 0}px
                    </div>
                  )}
                  
                  {/* Map updating indicator */}
                  {mapUpdating && (
                    <div className="absolute top-4 right-4 z-10 bg-blue-500 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Updating map...
                    </div>
                  )}
                  
                  {/* In MAP authority: always render from visible pins, never show loading skeletons */}
                  {arbiter.authority === 'MAP' ? (
                    <>
                      {visiblePinIdsState.length === 0 ? (
                        // No visible pins - show empty state
                        <div className="col-span-full text-center py-16">
                          <h3 className="text-xl font-semibold text-gray-800">Pan or zoom to see sales here</h3>
                          <p className="text-gray-500 mt-2">Move the map to find sales in your area.</p>
                        </div>
                      ) : (
                        // Show visible pins - render from markers immediately, hydrate from sales cache
                        <>
                          {visibleSales.length > 24 && (
                            <div className="col-span-full text-xs text-gray-600 mb-2">Showing first <strong>24</strong> of <strong>{visibleSales.length}</strong> in view</div>
                          )}
                          {(() => {
                            const itemsToRender = isUpdating ? staleSales : renderedSales
                            
                            // FALLBACK: If itemsToRender is empty but visibleSales has items, use visibleSales
                            // CLUSTER CLICK FIX: If mapSales has data (cluster click), use it directly
                            const finalItemsToRender = mapSales.length > 0 ? mapSales : (itemsToRender.length > 0 ? itemsToRender : visibleSales)
                            
                            // Debug cluster click rendering
                            console.log('[SALES LIST] DEBUG: Cluster click rendering - isUpdating:', isUpdating, 'itemsToRender:', itemsToRender.length, 'finalItemsToRender:', finalItemsToRender.length, 'visibleSales:', visibleSales.length, 'renderedSales:', renderedSales.length, 'staleSales:', staleSales.length, 'mapSales:', mapSales.length)
                            console.log('[SALES LIST] DEBUG: mapSales.length > 0?', mapSales.length > 0, 'mapSales:', mapSales.length, 'finalItemsToRender === mapSales?', finalItemsToRender === mapSales)
                            
                            // Debug sales list rendering
                            salesListDebug.logRendering('MAP', {
                              isUpdating,
                              staleSalesCount: staleSales.length,
                              renderedSalesCount: renderedSales.length,
                              visibleSalesCount: visibleSales.length,
                              itemsToRenderCount: itemsToRender.length,
                              finalItemsToRenderCount: finalItemsToRender.length
                            })
                            
                            console.log('[SALES LIST] MAP authority rendering:', {
                              isUpdating,
                              staleSalesCount: staleSales.length,
                              renderedSalesCount: renderedSales.length,
                              visibleSalesCount: visibleSales.length,
                              itemsToRenderCount: itemsToRender.length,
                              finalItemsToRenderCount: finalItemsToRender.length,
                              authority: arbiter.authority
                            })
                            
                            return finalItemsToRender.map((item: any, _idx: number) => {
                              salesListDebug.logSaleRender({ id: item.id, title: item.title })
                              console.log('[SALES LIST] Rendering sale (MAP):', { id: item.id, title: item.title })
                              return <SaleCard key={item.id} sale={item} authority={arbiter.authority} />
                            })
                          })()}
                        </>
                      )}
                    </>
                  ) : (
                    // Non-MAP authority: show loading skeletons when loading
                    <>
                      {(loading || !fetchedOnce) ? (
                        Array.from({ length: 6 }).map((_, idx) => (
                          <SaleCardSkeleton key={idx} />
                        ))
                      ) : sales.length === 0 ? (
                        // Show empty state message
                        <div className="col-span-full text-center py-16">
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
                        // Show actual sales
                        <>
                          {visibleSales.length > 24 && (
                            <div className="col-span-full text-xs text-gray-600 mb-2">Showing first <strong>24</strong> of <strong>{visibleSales.length}</strong> in view</div>
                          )}
                          {(() => {
                            const itemsToRender = isUpdating ? staleSales : renderedSales
                            
                            // Debug sales list rendering for non-MAP authority
                            salesListDebug.logRendering('Non-MAP', {
                              isUpdating,
                              staleSalesCount: staleSales.length,
                              renderedSalesCount: renderedSales.length,
                              salesCount: sales.length,
                              itemsToRenderCount: itemsToRender.length,
                              loading,
                              fetchedOnce
                            })
                            
                            console.log('[SALES LIST] Non-MAP authority rendering:')
                            console.log('  - isUpdating:', isUpdating)
                            console.log('  - staleSalesCount:', staleSales.length)
                            console.log('  - renderedSalesCount:', renderedSales.length)
                            console.log('  - salesCount:', sales.length)
                            console.log('  - itemsToRenderCount:', itemsToRender.length)
                            console.log('  - authority:', arbiter.authority)
                            console.log('  - loading:', loading)
                            console.log('  - fetchedOnce:', fetchedOnce)
                            console.log('  - sampleSales:', sales.slice(0, 3).map(s => ({ id: s.id, title: s.title })))
                            console.log('  - sampleRendered:', renderedSales.slice(0, 3).map(s => ({ id: s.id, title: s.title })))
                            console.log('  - sampleStale:', staleSales.slice(0, 3).map(s => ({ id: s.id, title: s.title })))
                            
                            return itemsToRender.map((item: any, _idx: number) => {
                              salesListDebug.logSaleRender({ id: item.id, title: item.title })
                              console.log('[SALES LIST] Rendering sale (Non-MAP):', { id: item.id, title: item.title })
                              return <SaleCard key={item.id} sale={item} authority={arbiter.authority} />
                            })
                          })()}
                        </>
                      )}
                    </>
                  )}
                </div>
                
                {/* Load more button - only show when not loading and has more */}
                {!(loading || !fetchedOnce) && sales.length > 0 && (
                  <LoadMoreButton
                    onLoadMore={loadMore}
                    hasMore={hasMore}
                    loading={loadingMore}
                  />
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
                dateRange: { type: filters.dateRange as any },
                categories: filters.categories
              }}
              onFiltersChange={(newFilters) => {
                if (newFilters.distance !== filters.distance) {
                  handleDistanceChange(newFilters.distance)
                }
                updateFilters({
                  distance: newFilters.distance,
                  dateRange: newFilters.dateRange.type as any,
                  categories: newFilters.categories
                })
              }}
              arbiter={arbiter}
            />
            
            {/* Map */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-xl font-semibold mb-4">
                Map View
                {renderedSales.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-600">
                    ({renderedSales.length} in view)
                  </span>
                )}
                {isUpdating && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    Updating...
                  </span>
                )}
              </h2>
              <div className={`h-[400px] rounded-lg overflow-hidden transition-opacity duration-300 ${mapFadeIn ? 'opacity-100' : 'opacity-0'} relative`} style={{ zIndex: 1, overflowAnchor: 'none' }}>
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
                         (() => {
                           console.error('CRITICAL: No location data for map - this should not happen')
                           throw new Error('No location data available for map')
                         })()}
                  zoom={filters.lat && filters.lng ? 12 : 10}
                  centerOverride={mapCenterOverride}
                  fitBounds={fitBounds}
                  arbiterMode={arbiter.mode}
                  arbiterAuthority={arbiter.authority}
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
                    
                    // Clear programmatic move guard after ZIP search completion
                    if (reason === 'zip') {
                      console.log('[CONTROL] clearing programmatic move guard after ZIP search')
                      setProgrammaticMoveGuard(false, 'ZIP search completed')
                    }
                    
                    // Trigger fetches once after fit completes with current coordinates
                    debouncedTrigger(() => {
                      if (filters.lat && filters.lng) {
                        fetchSales(false, { lat: filters.lat, lng: filters.lng })
                      } else {
                        fetchSales()
                      }
                      fetchMapSales()
                    })
                  }}
                  onBoundsChange={onBoundsChange}
                  onMapReady={onMapReady}
                  onVisiblePinsChange={(visibleIds, count) => {
                    const seq = viewportSeqRef.current
                    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                      console.log(`[LIST] visible pins seq=${seq} count=${count} ids=[${visibleIds.join(',')}]`)
                    }
                    
                    // Circuit breaker: only update if visible pins actually changed
                    const newVisibleIds = visibleIds.map(String)
                    const currentVisibleIds = visiblePinIdsState
                    
                    // Use hash-based change detection instead of length-only check
                    const newIdsHash = newVisibleIds.sort().join(',')
                    const currentIdsHash = currentVisibleIds.sort().join(',')
                    if (newIdsHash === currentIdsHash) {
                      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                        console.log('[LIST] visible pins unchanged - skipping update to prevent loop')
                      }
                      return
                    }
                    
                    setVisiblePinIdsState(newVisibleIds)
                  }}
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
                    fetchMapSales(undefined, center)
                  }}
                  onViewChange={({ center, zoom, userInteraction }) => {
                    setMapView({ center, zoom })
                    
                    console.log('[MAP] onViewChange called:', {
                      userInteraction,
                      programmaticMoveGuard: arbiter.programmaticMoveGuard,
                      authority: arbiter.authority,
                      mode: arbiter.mode
                    })
                    
                    // If programmatic move guard is active, ignore all changes except user interactions
                    if (arbiter.programmaticMoveGuard && !userInteraction) {
                      console.log('[ARB] map move ignored due to guard (programmatic)')
                      return
                    }
                    
                    // Only handle user interactions
                    if (userInteraction) {
                      console.log('[MAP] User interaction detected - switching to MAP authority')
                      // Set guard immediately on user interaction
                      setGuardMapMove(true, 'User panned/zoomed')
                      console.log('[MAP] userMove=true (guard active)')
                      
                      // Lock mode='map' for 600ms minimum to prevent thrashing
                      mapAuthorityUntilRef.current = Date.now() + 600

                      // Live-update markers during movement (immediate)
                      fetchMarkersDuringMove(center)
                      
                      if (arbiter.programmaticMoveGuard) {
                        console.log('[CONTROL] user pan -> mode: zip → map; guard=false')
                        setProgrammaticMoveGuard(false, 'User interaction after ZIP')
                        updateControlMode('map', 'User panned/zoomed after ZIP')
                      } else {
                        console.log('[CONTROL] user pan detected -> switching to map mode')
                        switchToMapIfUserGesture('User panned/zoomed')
                      }
                    } else {
                      console.log('[MAP] No user interaction detected - staying in FILTERS authority')
                    }

                    // Regardless of authority, keep markers fresh while moving (debounced and key-aware)
                    if (userInteraction) {
                      fetchMapSales(undefined, center, zoom)
                    }
                    
                    try {
                      const saved = JSON.parse(localStorage.getItem('lootaura_last_location') || '{}')
                      localStorage.setItem('lootaura_last_location', JSON.stringify({ ...saved, lat: center.lat, lng: center.lng }))
                    } catch (error) {
                      console.warn('Local storage error:', error)
                    }
                  }}
                  onMoveEnd={() => {
                    // Clear guard after user interaction completes
                    if (arbiter.guardMapMove) {
                      setGuardMapMove(false, 'Move completed')
                      console.log('[MAP] move completed - guard cleared')
                    }
                  }}
                  onZoomEnd={() => {
                    // Clear guard after user interaction completes
                    if (arbiter.guardMapMove) {
                      setGuardMapMove(false, 'Zoom completed')
                      console.log('[MAP] zoom completed - guard cleared')
                    }
                  }}
                />
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
                      Showing {renderedSales.length} sales
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
      
      {/* Diagnostic Overlay - only show in debug mode */}
      {isDebugMode && (
        <DiagnosticOverlay
          isVisible={showDiagnostics}
          onToggle={() => setShowDiagnostics(!showDiagnostics)}
        />
      )}
      
          {/* Layout Diagnostic */}
          {process.env.NODE_ENV === 'development' && (
            <LayoutDiagnostic 
              containerRef={gridContainerRef} 
              isVisible={visibleSales.length > 0}
            />
          )}
          
                  {/* Advanced Grid Layout Diagnostic */}
                  {process.env.NODE_ENV === 'development' && (
                    <GridLayoutDiagnostic 
                      containerRef={gridContainerRef} 
                      isVisible={visibleSales.length > 0}
                    />
                  )}
                  
                  {/* Grid Debug Overlay (gated by NEXT_PUBLIC_DEBUG) */}
                  <GridDebugOverlay 
                    containerRef={gridContainerRef}
                    isVisible={visibleSales.length > 0}
                    salesCount={visibleSales.length}
                  />
    </div>
  )
}