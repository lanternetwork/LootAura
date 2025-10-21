'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import SalesMap from '@/components/location/SalesMap'
import SaleCard from '@/components/SaleCard'
import FiltersModal from '@/components/filters/FiltersModal'
import FilterTrigger from '@/components/filters/FilterTrigger'
import { useFilters } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'
// Removed unused imports after arbiter system removal
import { Intent, FetchContext, isCauseCompatibleWithIntent } from '@/lib/sales/intent'
import { deduplicateSales } from '@/lib/sales/dedupe'
import { INTENT_ENABLED } from '@/lib/config'

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

  // Map view state - initialize with proper center
  const [mapView, setMapView] = useState<{ center: { lat: number; lng: number } | null; zoom: number | null }>({ 
    center: initialCenter || { lat: 39.8283, lng: -98.5795 }, 
    zoom: 10 
  })

  // Sales data state
  const [sales, _setSales] = useState<Sale[]>(initialSales)
  const [mapMarkers, _setMapMarkers] = useState<{ id: string; title: string; lat: number; lng: number }[]>(
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
  }, [])

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

    const currentSeq = seqRef.current
    const currentIntent = intentRef.current

    if (incoming.seq !== currentSeq) {
      console.debug('[APPLY] drop stale', { incomingSeq: incoming.seq, currentSeq })
      return
    }
    if (!isCauseCompatibleWithIntent(incoming.cause, currentIntent)) {
      console.debug('[APPLY] drop incompatible', { cause: incoming.cause, intent: currentIntent.kind })
      return
    }

    const deduped = deduplicateSales(incoming.data)
    if (target === 'map') {
      setMapSales({ data: deduped, seq: incoming.seq, source: incoming.cause })
    } else {
      setFilteredSales({ data: deduped, seq: incoming.seq, source: incoming.cause })
    }
    console.debug('[APPLY] ok', { target, count: deduped.length, seq: incoming.seq, cause: incoming.cause })
  }, [])

  // Fetch functions
  const fetchSales = useCallback(async (append: boolean = false, centerOverride?: { lat: number; lng: number }, _ctx?: FetchContext) => {
    console.log('[FETCH] fetchSales called with context:', { _ctx, append, centerOverride })
    
    // Implementation details would go here...
    // For now, return empty data
    return { data: [], ctx: _ctx || { cause: 'Filters', seq: 0 } }
  }, [])


  // Wrapper functions for intent-based fetching

  const runFilteredFetch = useCallback(async (params: any, ctx: FetchContext) => {
    console.debug('[FETCH] filtered', { ...ctx, params })
    
    try {
      const result = await fetchSales(false, params.centerOverride, ctx)
      if (result) {
        applySalesResult({ data: result.data, seq: result.ctx.seq, cause: result.ctx.cause }, 'filtered')
      }
    } catch (error) {
      console.error('[FETCH] Filtered fetch error:', error)
      applySalesResult({ data: [], seq: ctx.seq, cause: ctx.cause }, 'filtered')
    }
  }, [applySalesResult, fetchSales])

  // Event handlers

  const handleFiltersChange = useCallback((nextFilters: any) => {
    if (INTENT_ENABLED) {
      const seq = ++seqRef.current
      intentRef.current = { kind: 'Filters' }
      console.log('[INTENT] set Filters', { seq })
      
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
  
  console.log('[DEBUG] Map props:', { 
    center: mapCenter, 
    zoom: mapZoom,
    salesCount,
    mapView,
    mapSales,
    filteredSales
  })

  // Render
  return (
    <div className="flex flex-col lg:flex-row">
      {/* Main Content */}
      <div className="flex-1 lg:w-2/3">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Yard Sales</h1>
            <FilterTrigger 
              isOpen={false} 
              onToggle={() => {}} 
              activeFiltersCount={0} 
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listData.map((sale) => (
              <SaleCard key={sale.id} sale={sale} />
            ))}
          </div>
        </div>
      </div>

      {/* Desktop Filters Sidebar */}
      <div className="hidden lg:block lg:w-1/3">
        <div className="sticky top-4 space-y-6">
          {/* Map */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h2 className="text-xl font-semibold mb-4">
              Map View
              {listData.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-600">
                  ({listData.length} in view)
                </span>
              )}
            </h2>
            <div className="h-[400px] rounded-lg overflow-hidden">
              <SalesMap
                sales={mapSales.data || []}
                markers={mapMarkers}
                center={mapView.center || { lat: 39.8283, lng: -98.5795 }}
                zoom={mapView.zoom || 10}
                onViewChange={({ center, zoom, userInteraction }) => {
                  setMapView({ center, zoom })
                  
                  // Handle move start for intent system
                  if (INTENT_ENABLED && userInteraction) {
                    // Don't change intent if we're in ClusterDrilldown - let it complete
                    const currentIntent = intentRef.current
                    if (currentIntent.kind !== 'ClusterDrilldown') {
                      bumpSeq({ kind: 'UserPan' })
                    } else {
                      console.log('[MAP] Ignoring user interaction during cluster drilldown')
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
                  console.log('[CLUSTER] Drilldown complete with', unique.length, 'sales')
                }}
                onVisiblePinsChange={() => {
                  // Legacy callback - no longer needed with intent system
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filters Modal */}
      <FiltersModal
        isOpen={false}
        onClose={() => {}}
        filters={{
          distance: filters.distance,
          dateRange: filters.dateRange as any,
          categories: filters.categories
        }}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  )
}
