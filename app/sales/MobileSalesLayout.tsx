'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
// Lazy-load SimpleMap on mobile to defer Mapbox bundle loading
const SimpleMap = dynamic(() => import('@/components/location/SimpleMap'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-gray-100" />
  )
})
import MobileSalesBottomSheet, { BottomSheetState } from '@/components/sales/MobileSalesBottomSheet'
import FiltersBar from '@/components/sales/FiltersBar'
import { Sale } from '@/lib/types'
import { DateRangeType } from '@/lib/hooks/useFilters'

const HEADER_HEIGHT = 64 // px
const FILTERS_HEIGHT = 56 // px

interface MobileSalesLayoutProps {
  // Map props
  mapView: { center: { lat: number; lng: number }; zoom: number; bounds: { west: number; south: number; east: number; north: number } } | null
  pendingBounds: { west: number; south: number; east: number; north: number } | null
  mapSales: Sale[]
  selectedPinId: string | null
  onViewportChange: (args: { center: { lat: number; lng: number }; zoom: number; bounds: { west: number; south: number; east: number; north: number } }) => void
  onLocationClick: (locationId: string) => void
  onClusterClick: (args: { lat: number; lng: number; expandToZoom: number }) => void
  currentViewport: { bounds: [number, number, number, number]; zoom: number } | null
  
  // Bottom sheet props
  visibleSales: Sale[]
  loading: boolean
  onClearSelection: () => void
  
  // Filter props
  filters: {
    dateRange: DateRangeType
    categories: string[]
    distance: number
  }
  onFiltersChange: (newFilters: any) => void
  onClearFilters: () => void
  onZipLocationFound: (lat: number, lng: number, city?: string, state?: string, zip?: string) => void
  onZipError: (error: string) => void
  zipError: string | null
  hasActiveFilters: boolean
}

export default function MobileSalesLayout({
  mapView,
  pendingBounds,
  mapSales,
  selectedPinId,
  onViewportChange,
  onLocationClick,
  onClusterClick,
  currentViewport,
  visibleSales,
  loading,
  onClearSelection,
  filters,
  onFiltersChange,
  onClearFilters,
  onZipLocationFound,
  onZipError,
  zipError,
  hasActiveFilters
}: MobileSalesLayoutProps) {
  const [sheetState, setSheetState] = useState<BottomSheetState>('half')
  const [sheetHeightPx, setSheetHeightPx] = useState(0)

  // Calculate available height for map - use state to trigger re-render when sheet height changes
  const [mapContainerHeight, setMapContainerHeight] = useState<string>('calc(100vh - 120px)')
  
  useEffect(() => {
    const newHeight = `calc(100vh - ${HEADER_HEIGHT + FILTERS_HEIGHT}px - ${sheetHeightPx}px)`
    setMapContainerHeight(newHeight)
  }, [sheetHeightPx])

  // Handle sheet state change
  const handleSheetStateChange = useCallback((nextState: BottomSheetState) => {
    setSheetState(nextState)
  }, [])

  // Handle sheet height change
  const handleSheetHeightChange = useCallback((heightPx: number) => {
    setSheetHeightPx(heightPx)
  }, [])

  return (
    <div 
      className="flex flex-col overflow-hidden" 
      style={{ height: `calc(100vh - ${HEADER_HEIGHT}px)` }}
    >
      {/* Filters Bar */}
      <FiltersBar
        onZipLocationFound={onZipLocationFound}
        onZipError={onZipError}
        zipError={zipError}
        dateRange={filters.dateRange}
        onDateRangeChange={(dateRange: DateRangeType) => onFiltersChange({ ...filters, dateRange })}
        categories={filters.categories}
        onCategoriesChange={(categories) => onFiltersChange({ ...filters, categories })}
        distance={filters.distance}
        onDistanceChange={(distance) => onFiltersChange({ ...filters, distance })}
        hasActiveFilters={hasActiveFilters}
        isLoading={loading}
        onClearFilters={onClearFilters}
        zipInputTestId="zip-input"
        filtersCenterTestId="filters-center"
        filtersMoreTestId="filters-more"
        onMobileFilterClick={() => {}}
      />

      {/* Map + Bottom Sheet Container */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Map - Height adjusts based on sheet height */}
        <div 
          className="relative bg-gray-100 flex-shrink-0"
          style={{ height: mapContainerHeight }}
        >
          {mapView && currentViewport && (
            <SimpleMap
              center={mapView.center}
              zoom={pendingBounds ? undefined : mapView.zoom}
              fitBounds={pendingBounds}
              fitBoundsOptions={pendingBounds ? { 
                padding: 20, 
                duration: 0
              } : undefined}
              hybridPins={{
                sales: mapSales,
                selectedId: selectedPinId,
                onLocationClick: onLocationClick,
                onClusterClick: onClusterClick,
                viewport: currentViewport
              }}
              onViewportChange={onViewportChange}
              attributionPosition="top-right"
              showOSMAttribution={true}
              attributionControl={false}
              bottomSheetHeight={sheetHeightPx}
            />
          )}
        </div>

        {/* Bottom Sheet - Fixed at bottom, height controlled by state */}
        <MobileSalesBottomSheet
          state={sheetState}
          onStateChange={handleSheetStateChange}
          onHeightChange={handleSheetHeightChange}
          sales={visibleSales}
          loading={loading}
          selectedPinId={selectedPinId}
          onClearSelection={onClearSelection}
          mapView={mapView}
        />
      </div>
    </div>
  )
}

