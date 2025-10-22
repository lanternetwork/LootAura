'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import SaleCard from '@/components/SaleCard'
import { useFilters } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'
// Removed unused imports after arbiter system removal
import { Intent, FetchContext, isCauseCompatibleWithIntent } from '@/lib/sales/intent'
import { deduplicateSales } from '@/lib/sales/dedupe'
import { extractSales } from '@/app/sales/lib/extractSales'
import { SalesResponseSchema, normalizeSalesJson } from '@/lib/data/sales-schemas'
import { INTENT_ENABLED, DEBUG_ENABLED } from '@/lib/config'
import SalesTwoPane from '@/components/layout/SalesTwoPane'
import SalesTabbed from '@/components/layout/SalesTabbed'
import FiltersBar from '@/components/sales/FiltersBar'
import SalesMap from '@/components/location/SalesMap'
import SalesMapClustered from '@/components/location/SalesMapClustered'
import { isClusteringEnabled } from '@/lib/clustering'

// Legacy arbiter types removed - using intent system only

// QueryShape interface removed - no longer needed after arbiter system removal

interface _MapViewState {
  center: { lat: number; lng: number }
  bounds: { west: number; south: number; east: number; north: number }
  zoom: number
  radiusKm: number
}

// Helper functions (currently unused but kept for potential future use)
function _createShapeHash(lat: number, lng: number, radiusKm: number, dateRange: string, categories: string[]): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm.toFixed(2)},${dateRange},${categories.sort().join(',')}`
}

function _computeRadiusFromZoom(zoom: number): number {
  // Approximate radius in km from zoom level
  const earthCircumference = 40075 // km
  const tileSize = 256
  const tilesAtZoom = Math.pow(2, zoom)
  const metersPerPixel = (earthCircumference * 1000) / (tilesAtZoom * tileSize)
  const radiusMeters = (window.innerWidth / 2) * metersPerPixel
  return radiusMeters / 1000 // convert to km
}

interface SalesClientProps {
  initialSales: Sale[]
  initialSearchParams: Record<string, string>
  initialCenter: { lat: number; lng: number } | null
  user: User | null
}

export default function SalesClient({ initialSales, initialSearchParams: _initialSearchParams, initialCenter, user: _user }: SalesClientProps) {
  const _router = useRouter()
  const _searchParams = useSearchParams()
  const { filters, updateFilters: _updateFilters, hasActiveFilters: _hasActiveFilters } = useFilters(
    initialCenter?.lat && initialCenter?.lng ? { lat: initialCenter.lat, lng: initialCenter.lng } : undefined
  )

  // Intent-based system state
  const intentRef = useRef<Intent>({ kind: 'Filters' })
  const seqRef = useRef(0)
  const programmaticMoveRef = useRef(false)

  // Update debug intent attribute when intent changes
  useEffect(() => {
    const salesRoot = document.querySelector('[data-testid="sales-root"]')
    if (salesRoot) {
      salesRoot.setAttribute('data-debug-intent', `${intentRef.current.kind}:${(intentRef.current as any).reason ?? ''}`)
    }
  }, [intentRef.current])

  // Map view state - initialize with proper center
  const [mapView, setMapView] = useState<{ center: { lat: number; lng: number } | null; zoom: number | null }>({ 
    center: initialCenter || { lat: 39.8283, lng: -98.5795 }, 
    zoom: 10 
  })

  // Debug logging for center initialization
  if (DEBUG_ENABLED) {
    console.log('[SALES_CLIENT] Initial center:', initialCenter)
    console.log('[SALES_CLIENT] Map view center:', mapView.center)
    console.log('[SALES_CLIENT] Map view center details:', JSON.stringify(mapView.center, null, 2))
  }

  // Sales data state
  const [sales, _setSales] = useState<Sale[]>(initialSales)
  const [mapMarkers, setMapMarkers] = useState<{ id: string; title: string; lat: number; lng: number }[]>(
    initialSales.map(sale => ({
      id: sale.id,
      title: sale.title,
      lat: sale.lat || 0,
      lng: sale.lng || 0
    }))
  )
  const [mapSales, setMapSales] = useState<{ data: Sale[]; seq: number; source: FetchContext['cause'] }>({
    data: initialSales, seq: 0, source: 'Filters' as any
  })
  const [filteredSales, setFilteredSales] = useState<{ data: Sale[]; seq: number; source: FetchContext['cause'] }>({
    data: initialSales, seq: 0, source: 'Filters' as any
  })

  // UI state
  const [_loading, _setLoading] = useState(false)
  // Legacy state variables removed - using intent system only

  // Intent system helpers
  const bumpSeq = useCallback((newIntent: Intent) => {
    seqRef.current += 1
    intentRef.current = newIntent
    console.debug('[INTENT] set', { intent: newIntent.kind, seq: seqRef.current })
    
    // Update debug intent attribute
    const salesRoot = document.querySelector('[data-testid="sales-root"]')
    if (salesRoot) {
      salesRoot.setAttribute('data-debug-intent', `${newIntent.kind}:${(newIntent as any).reason ?? ''}`)
    }
  }, [])

  // Update markers when sales data changes
  useEffect(() => {
    const currentSales = mapSales.data || []
    const newMarkers = currentSales.map(sale => ({
      id: sale.id,
      title: sale.title,
      lat: sale.lat || 0,
      lng: sale.lng || 0
    }))
    setMapMarkers(newMarkers)
    if (DEBUG_ENABLED) {
      console.log('[MARKERS] Updated markers:', { 
        count: newMarkers.length,
        sample: newMarkers.slice(0, 3),
        salesCount: currentSales.length
      })
    }
  }, [mapSales.data])

  // Single source of truth for the list
  const listData: Sale[] = useMemo(() => {
    if (!INTENT_ENABLED) return sales

    const i = intentRef.current
    if (i.kind === 'Filters')          return filteredSales.data || []
    if (i.kind === 'ClusterDrilldown') return mapSales.data || []
    if (i.kind === 'UserPan')          return mapSales.data || []

    // fallback: prefer filtered if present
    const result = filteredSales.data.length ? filteredSales.data : (mapSales.data || [])
    console.debug('[LIST]', { count: result.length, intent: (i as any).kind })
    return result
  }, [filteredSales.data, mapSales.data, sales])

  // Unified "apply results" helper
  const applySalesResult = useCallback((
    incoming: { data: Sale[]; seq: number; cause: FetchContext['cause'] },
    target: 'map' | 'filtered'
  ) => {
    if (!INTENT_ENABLED) return

    // Parse OK? (we did above in fetchSales)
    if (!Array.isArray(incoming.data)) {
      console.debug('[APPLY] drop invalid', { reason: 'not array', data: typeof incoming.data })
      return
    }

    // Deduplicate before gate
    const unique = deduplicateSales(incoming.data)

    // Gate: apply only if res.seq >= seqRef.current and compatible
    const currentSeq = seqRef.current
    const currentIntent = intentRef.current

    if (incoming.seq < currentSeq) {
      console.debug('[APPLY] drop stale', { incomingSeq: incoming.seq, currentSeq })
      return
    }
    if (!isCauseCompatibleWithIntent(incoming.cause, currentIntent)) {
      console.debug('[APPLY] drop incompatible', { cause: incoming.cause, intent: currentIntent.kind })
      return
    }

    // Apply the result
    if (target === 'map') {
      setMapSales({ data: unique, seq: incoming.seq, source: incoming.cause })
    } else {
      setFilteredSales({ data: unique, seq: incoming.seq, source: incoming.cause })
    }
    console.log('[APPLY] ok', { intent: currentIntent.kind, seq: incoming.seq, count: unique.length })
  }, [])

  // Fetch functions
  const fetchSales = useCallback(async (append: boolean = false, centerOverride?: { lat: number; lng: number }, _ctx?: FetchContext) => {
    console.log('[FETCH] fetchSales called with context:', { _ctx, append, centerOverride })
    
    try {
      const params = new URLSearchParams()
      if (centerOverride) {
        params.set('lat', centerOverride.lat.toString())
        params.set('lng', centerOverride.lng.toString())
      } else if (mapView.center) {
        // Use current map center if no override provided
        params.set('lat', mapView.center.lat.toString())
        params.set('lng', mapView.center.lng.toString())
      }
      if (filters.distance) {
        params.set('distanceKm', filters.distance.toString())
      }
      if (filters.dateRange) {
        params.set('dateRange', filters.dateRange)
      }
      if (filters.categories && filters.categories.length > 0) {
        params.set('categories', filters.categories.join(','))
      }

      const url = `/api/sales?${params.toString()}`
      console.log('[FETCH] Making request to:', url)
      console.log('[FETCH] Request params:', Object.fromEntries(params.entries()))
      
      const response = await fetch(url)
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[FETCH] API error:', response.status, response.statusText, errorText)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const json = await response.json()
      console.log('[FETCH] Raw API response:', json)
      console.log('[FETCH] Raw API response details:', JSON.stringify(json, null, 2))
      
      const normalized = normalizeSalesJson(json)
      const parsed = SalesResponseSchema.safeParse(normalized)
      const sales: Sale[] = parsed.success ? parsed.data.sales as Sale[] : []
      const meta = parsed.success ? parsed.data.meta : { parse: "failed" }
      
      console.log('[FETCH] fetchSales response:', { count: sales.length, ctx: _ctx, meta })
      console.log('[FETCH] Sales sample:', sales.slice(0, 2))
      
      return { data: sales, ctx: _ctx || { cause: 'Filters', seq: 0 } }
    } catch (error) {
      console.error('[FETCH] fetchSales error:', error)
      return { data: [], ctx: _ctx || { cause: 'Filters', seq: 0 } }
    }
  }, [filters.distance, filters.dateRange, filters.categories, mapView.center])


  // Wrapper functions for intent-based fetching

  const runFilteredFetch = useCallback(async (params: any, ctx: FetchContext) => {
    console.debug('[FETCH] filtered', { ...ctx, params })
    
    try {
      const result = await fetchSales(false, params.centerOverride, ctx)
      if (result) {
        const unique = deduplicateSales(result.data)
        console.log('[FETCH] filtered: in=%d out=%d', result.data.length, unique.length)
        // Update both filtered and map data for ZIP search
        applySalesResult({ data: unique, seq: result.ctx.seq, cause: result.ctx.cause }, 'filtered')
        applySalesResult({ data: unique, seq: result.ctx.seq, cause: result.ctx.cause }, 'map')
      }
    } catch (error) {
      console.error('[FETCH] Filtered fetch error:', error)
      applySalesResult({ data: [], seq: ctx.seq, cause: ctx.cause }, 'filtered')
      applySalesResult({ data: [], seq: ctx.seq, cause: ctx.cause }, 'map')
    }
  }, [applySalesResult, fetchSales])

  // Event handlers

  const _handleFiltersChange = useCallback((nextFilters: any) => {
    if (INTENT_ENABLED) {
      const seq = ++seqRef.current
      intentRef.current = { kind: 'Filters' }
      if (DEBUG_ENABLED) {
        console.log('[INTENT] set Filters', { seq })
      }
      
      const params = { 
        lat: nextFilters.lat, 
        lng: nextFilters.lng, 
        distance: nextFilters.distance,
        centerOverride: { lat: nextFilters.lat, lng: nextFilters.lng }
      }
      runFilteredFetch(params, { cause: 'Filters', seq })
    }
  }, [runFilteredFetch])

  // Debug logging
  const mapCenter = mapView.center || { lat: 39.8283, lng: -98.5795 }
  const mapZoom = mapView.zoom || 10
  const salesCount = mapSales.data?.length || 0
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[DEBUG] Map props:', { 
      center: mapCenter, 
      zoom: mapZoom,
      salesCount,
      mapView,
      mapSales,
      filteredSales,
      markersCount: mapMarkers.length,
      clusteringEnabled: process.env.NEXT_PUBLIC_FEATURE_CLUSTERING
    })
    console.log('[DEBUG] Markers details:', mapMarkers.slice(0, 3)) // Show first 3 markers
  }

  // ZIP resolved handler
  const onZipResolved = useCallback(({ zip, center, name }: { zip: string; center: [number, number]; name: string }) => {
    console.log('[SALES_CLIENT] ZIP resolved:', { zip, center, name })
    
    // Set intent to Filters with source Zip
    bumpSeq({ kind: 'Filters', reason: 'Zip' })
    const mySeq = seqRef.current
    
    // Set programmatic move flag
    programmaticMoveRef.current = true
    
    // Center map programmatically
    const [lng, lat] = center
    console.log('[SALES_CLIENT] Setting map view to:', { center: { lat, lng }, zoom: 12 })
    setMapView({ center: { lat, lng }, zoom: 12 })
    
    // Run filtered fetch with ZIP parameters
    const params = { 
      lat, 
      lng, 
      distance: filters.distance,
      centerOverride: { lat, lng }
    }
    
    console.log('[SALES_CLIENT] ZIP search triggering fetch with params:', params)
    runFilteredFetch(params, { cause: 'Filters', seq: mySeq })
    
    // Clear programmatic move flag after a brief delay
    setTimeout(() => { programmaticMoveRef.current = false }, 0)
  }, [bumpSeq, runFilteredFetch, filters.distance])

  // Create reusable components for the new layout
  const filtersComponent = (
    <FiltersBar
      onZipLocationFound={(lat, lng, _city, _state, _zip) => {
        console.log('[SALES_CLIENT] ZIP location found:', { lat, lng, _city, _state, _zip })
        
        // Convert to onZipResolved format
        onZipResolved({ 
          zip: _zip || '', 
          center: [lng, lat], 
          name: _city || '' 
        })
      }}
      onZipError={(error: any) => {
        console.error('ZIP search error:', error)
        console.error('ZIP search error details:', error instanceof Error ? error.message : String(error))
      }}
      zipError=""
      dateRange={filters.dateRange}
      onDateRangeChange={(dateRange) => _updateFilters({ dateRange: dateRange as 'today' | 'weekend' | 'next_weekend' | 'any' })}
      categories={filters.categories}
      onCategoriesChange={(categories) => _updateFilters({ categories })}
      distance={filters.distance}
      onDistanceChange={(distance) => _updateFilters({ distance })}
      onAdvancedFiltersOpen={() => {}}
      hasActiveFilters={_hasActiveFilters}
    />
  )

  const mapComponent = isClusteringEnabled() ? (
    <SalesMapClustered
      sales={mapSales.data || []}
      markers={mapMarkers}
      center={mapView.center || { lat: 39.8283, lng: -98.5795 }}
      zoom={mapView.zoom || 10}
      onViewChange={({ center, zoom, userInteraction }) => {
        if (DEBUG_ENABLED) {
          console.log('[SALES_CLIENT] onViewChange called with:', { center, zoom, userInteraction })
        }
        
        // Ignore programmatic moves
        if (programmaticMoveRef.current) {
          if (DEBUG_ENABLED) {
            console.log('[SALES_CLIENT] Ignoring programmatic move')
          }
          return
        }
        
        // Don't update center if it's (0,0) - this indicates the map hasn't properly initialized
        // But allow zoom changes even with (0,0) center
        if (center.lat === 0 && center.lng === 0) {
          if (DEBUG_ENABLED) {
            console.log('[SALES_CLIENT] Ignoring (0,0) center from map, but allowing zoom update')
          }
          // Still update zoom even if center is (0,0)
          setMapView(prev => ({ ...prev, zoom }))
          return
        }
        
        setMapView({ center, zoom })
        
        // Handle move start for intent system
        if (INTENT_ENABLED && userInteraction) {
          // Don't change intent if we're in ClusterDrilldown - let it complete
          const currentIntent = intentRef.current
          if (currentIntent.kind !== 'ClusterDrilldown') {
            bumpSeq({ kind: 'UserPan' })
          } else {
            if (DEBUG_ENABLED) {
              if (DEBUG_ENABLED) {
              console.log('[MAP] Ignoring user interaction during cluster drilldown')
            }
            }
          }
        }
      }}
      onClusterClick={async (clusterSales) => {
        if (!INTENT_ENABLED) return

        bumpSeq({ kind: 'ClusterDrilldown' })
        const mySeq = seqRef.current

        // Resolve leaves (actual sales, not child clusters)
        const unique = deduplicateSales(clusterSales)

        // Set map sales immediately for snappy UI using intent system
        applySalesResult({ data: unique, seq: mySeq, cause: 'ClusterDrilldown' }, 'map')
        console.debug('[CLUSTER] leaves', { count: unique.length, seq: mySeq })

        // Cluster drilldown is complete - no need to fetch additional data
        if (DEBUG_ENABLED) {
          console.log('[CLUSTER] Drilldown complete with', unique.length, 'sales')
        }
      }}
      onVisiblePinsChange={() => {
        // Legacy callback - no longer needed with intent system
      }}
    />
  ) : (
    <SalesMap
      sales={mapSales.data || []}
      markers={mapMarkers}
      center={mapView.center || { lat: 39.8283, lng: -98.5795 }}
      zoom={mapView.zoom || 10}
      onViewChange={({ center, zoom, userInteraction }) => {
        if (DEBUG_ENABLED) {
          console.log('[SALES_CLIENT] onViewChange called with:', { center, zoom, userInteraction })
        }
        
        // Ignore programmatic moves
        if (programmaticMoveRef.current) {
          if (DEBUG_ENABLED) {
            console.log('[SALES_CLIENT] Ignoring programmatic move')
          }
          return
        }
        
        // Don't update center if it's (0,0) - this indicates the map hasn't properly initialized
        // But allow zoom changes even with (0,0) center
        if (center.lat === 0 && center.lng === 0) {
          if (DEBUG_ENABLED) {
            console.log('[SALES_CLIENT] Ignoring (0,0) center from map, but allowing zoom update')
          }
          // Still update zoom even if center is (0,0)
          setMapView(prev => ({ ...prev, zoom }))
          return
        }
        
        setMapView({ center, zoom })
        
        // Handle move start for intent system
        if (INTENT_ENABLED && userInteraction) {
          // Don't change intent if we're in ClusterDrilldown - let it complete
          const currentIntent = intentRef.current
          if (currentIntent.kind !== 'ClusterDrilldown') {
            bumpSeq({ kind: 'UserPan' })
          } else {
            if (DEBUG_ENABLED) {
              console.log('[MAP] Ignoring user interaction during cluster drilldown')
            }
          }
        }
      }}
      onClusterClick={async (clusterSales) => {
        if (!INTENT_ENABLED) return

        bumpSeq({ kind: 'ClusterDrilldown' })
        const mySeq = seqRef.current

        // Resolve leaves (actual sales, not child clusters)
        const unique = deduplicateSales(clusterSales)

        // Set map sales immediately for snappy UI using intent system
        applySalesResult({ data: unique, seq: mySeq, cause: 'ClusterDrilldown' }, 'map')
        console.debug('[CLUSTER] leaves', { count: unique.length, seq: mySeq })

        // Cluster drilldown is complete - no need to fetch additional data
        if (DEBUG_ENABLED) {
          console.log('[CLUSTER] Drilldown complete with', unique.length, 'sales')
        }
      }}
      onVisiblePinsChange={() => {
        // Legacy callback - no longer needed with intent system
      }}
    />
  )

  const listComponent = (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">
          Sales
          {listData.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-600">
              ({listData.length} in view)
            </span>
          )}
        </h2>
      </div>
      <div className="space-y-4">
        {listData.map((sale) => (
          <SaleCard key={sale.id} sale={sale} />
        ))}
      </div>
    </div>
  )

  // Render with new Zillow-style layout
  return (
    <>
      {/* Mobile/Tablet tabbed version */}
      <div data-testid="sales-root-mobile" data-debug-intent={`${intentRef.current.kind}:${(intentRef.current as any).reason ?? ''}`} className="lg:hidden">
        <SalesTabbed filters={filtersComponent} map={mapComponent} list={listComponent} />
      </div>
      {/* Desktop two-pane version */}
      <div data-testid="sales-root-desktop" data-debug-intent={`${intentRef.current.kind}:${(intentRef.current as any).reason ?? ''}`} className="hidden lg:block">
        <SalesTwoPane filters={filtersComponent} map={mapComponent} list={listComponent} />
      </div>
    </>
  )
}
