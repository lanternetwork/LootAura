'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import SimpleMap from '@/components/location/SimpleMap'
import MobileSaleCallout from '@/components/sales/MobileSaleCallout'
import MobileFiltersModal from '@/components/sales/MobileFiltersModal'
import SalesList from '@/components/SalesList'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import { Sale } from '@/lib/types'
import { DateRangeType } from '@/lib/hooks/useFilters'

const HEADER_HEIGHT = 64 // px

type MobileMode = 'map' | 'list'

interface MobileSalesShellProps {
  // Map props
  mapView: { center: { lat: number; lng: number }; zoom: number; bounds: { west: number; south: number; east: number; north: number } } | null
  pendingBounds: { west: number; south: number; east: number; north: number } | null
  mapSales: Sale[]
  selectedPinId: string | null
  onViewportChange: (args: { center: { lat: number; lng: number }; zoom: number; bounds: { west: number; south: number; east: number; north: number } }) => void
  onLocationClick: (locationId: string) => void
  onClusterClick: (args: { lat: number; lng: number; expandToZoom: number }) => void
  currentViewport: { bounds: [number, number, number, number]; zoom: number } | null
  
  // Sales list props
  visibleSales: Sale[]
  loading: boolean
  
  // Filter props
  filters: {
    dateRange: DateRangeType
    categories: string[]
    distance: number
  }
  onFiltersChange: (newFilters: any) => void
  onClearFilters: () => void
  onZipLocationFound: (lat: number, lng: number, city?: string, state?: string, zip?: string, bbox?: [number, number, number, number]) => void
  onZipError: (error: string) => void
  zipError: string | null
  hasActiveFilters: boolean
}

/**
 * Mobile-only sales shell component that provides:
 * - Full-screen map mode (default)
 * - Full-screen list mode
 * - Small callout card on pin selection (instead of large bottom tray)
 * - Full-screen filters modal (instead of persistent filter bar)
 */
export default function MobileSalesShell({
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
  filters,
  onFiltersChange,
  onClearFilters,
  onZipLocationFound,
  onZipError,
  zipError,
  hasActiveFilters
}: MobileSalesShellProps) {
  const router = useRouter()
  
  // Mobile-only state
  const [mode, setMode] = useState<MobileMode>('map')
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false)
  
  // Find selected sale from selectedPinId
  const selectedSale = useMemo(() => {
    if (!selectedPinId) return null
    return mapSales.find(sale => sale.id === selectedPinId) || null
  }, [selectedPinId, mapSales])
  
  // Handle mode toggle
  const handleToggleMode = useCallback(() => {
    setMode(prev => prev === 'map' ? 'list' : 'map')
  }, [])
  
  // Map viewport for callout
  const mapViewport = useMemo(() => {
    if (!mapView) return null
    return {
      center: mapView.center,
      zoom: mapView.zoom
    }
  }, [mapView])
  
  return (
    <div 
      className="flex flex-col overflow-hidden md:hidden" 
      style={{ height: `calc(100vh - ${HEADER_HEIGHT}px)` }}
    >
      {/* Map Mode */}
      {mode === 'map' && mapView && currentViewport && (
        <div className="relative flex-1 min-h-0 bg-gray-100">
          {/* Full-screen map */}
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
            interactive={true}
          />
          
          {/* Floating Action Buttons */}
          <div className="absolute inset-0 pointer-events-none z-10">
            {/* Filters FAB - Top Left */}
            <button
              onClick={() => setIsFiltersModalOpen(true)}
              className="absolute top-4 left-4 pointer-events-auto bg-white hover:bg-gray-50 shadow-lg rounded-full p-3 min-w-[48px] min-h-[48px] flex items-center justify-center transition-colors"
              aria-label="Open filters"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {hasActiveFilters && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#F4B63A] rounded-full"></span>
              )}
            </button>
            
            {/* Mode Toggle FAB - Bottom Right */}
            <button
              onClick={handleToggleMode}
              className="absolute bottom-20 right-4 pointer-events-auto bg-white hover:bg-gray-50 shadow-lg rounded-full p-3 min-w-[48px] min-h-[48px] flex items-center justify-center transition-colors"
              aria-label="Switch to list view"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
          
          {/* Callout Card - Shows when a sale is selected */}
          {selectedSale && (
            <MobileSaleCallout
              sale={selectedSale}
              onDismiss={() => onLocationClick(selectedPinId || '')}
              viewport={mapViewport}
            />
          )}
        </div>
      )}
      
      {/* List Mode */}
      {mode === 'list' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Sticky Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Sales ({visibleSales.length})
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFiltersModalOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Open filters"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {hasActiveFilters && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#F4B63A] rounded-full"></span>
                )}
              </button>
              <button
                onClick={handleToggleMode}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Switch to map view"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SaleCardSkeleton key={i} />
                ))}
              </div>
            )}
            
            {!loading && visibleSales.length === 0 && (
              <div className="text-center py-12 px-4">
                <div className="text-gray-500 mb-4">
                  No sales found in this area
                </div>
                <button
                  onClick={() => setIsFiltersModalOpen(true)}
                  className="text-[#F4B63A] hover:text-[#dca32f] font-medium"
                >
                  Adjust filters →
                </button>
              </div>
            )}
            
            {!loading && visibleSales.length > 0 && (
              <div className="p-4">
                <SalesList 
                  sales={visibleSales} 
                  _mode="grid" 
                  viewport={mapViewport || { center: { lat: 39.8283, lng: -98.5795 }, zoom: 10 }} 
                />
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Filters Modal */}
      <MobileFiltersModal
        isOpen={isFiltersModalOpen}
        onClose={() => setIsFiltersModalOpen(false)}
        dateRange={filters.dateRange}
        onDateRangeChange={(dateRange: DateRangeType) => onFiltersChange({ ...filters, dateRange })}
        categories={filters.categories}
        onCategoriesChange={(categories) => onFiltersChange({ ...filters, categories })}
        distance={filters.distance}
        onDistanceChange={(distance) => onFiltersChange({ ...filters, distance })}
        hasActiveFilters={hasActiveFilters}
        isLoading={loading}
        onClearFilters={onClearFilters}
        onZipLocationFound={onZipLocationFound}
        onZipError={onZipError}
        zipError={zipError}
      />
    </div>
  )
}

