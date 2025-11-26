'use client'

import { useEffect, useCallback } from 'react'
import SalesList from '@/components/SalesList'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import { Sale } from '@/lib/types'

export type BottomSheetState = 'collapsed' | 'half' | 'full'

interface MobileSalesBottomSheetProps {
  state: BottomSheetState
  onStateChange: (nextState: BottomSheetState) => void
  onHeightChange: (heightPx: number) => void
  sales: Sale[]
  loading: boolean
  selectedPinId: string | null
  onClearSelection: () => void
  mapView?: { center: { lat: number; lng: number }; zoom: number } | null
}

const HEADER_HEIGHT = 64 // px - header height

export default function MobileSalesBottomSheet({
  state,
  onStateChange,
  onHeightChange,
  sales,
  loading,
  selectedPinId,
  onClearSelection,
  mapView
}: MobileSalesBottomSheetProps) {
  // Calculate target height based on state
  const calculateHeight = useCallback((sheetState: BottomSheetState): number => {
    if (typeof window === 'undefined') return 0
    
    const viewportHeight = window.innerHeight
    const availableHeight = viewportHeight - HEADER_HEIGHT
    
    switch (sheetState) {
      case 'collapsed':
        // Small bar with header and grab handle (~108px)
        return 108
      case 'half':
        // ~50% of viewport height
        return Math.floor(availableHeight * 0.5)
      case 'full':
        // Full height below header
        return availableHeight
      default:
        return 108
    }
  }, [])

  // Update height whenever state changes
  useEffect(() => {
    const height = calculateHeight(state)
    onHeightChange(height)
  }, [state, calculateHeight, onHeightChange])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const height = calculateHeight(state)
      onHeightChange(height)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [state, calculateHeight, onHeightChange])

  const handleHeaderClick = useCallback(() => {
    if (state === 'collapsed') {
      onStateChange('half')
    } else if (state === 'half') {
      onStateChange('full')
    }
  }, [state, onStateChange])

  const handleShowLess = useCallback(() => {
    if (state === 'full') {
      onStateChange('half')
    } else if (state === 'half') {
      onStateChange('collapsed')
    }
  }, [state, onStateChange])

  const currentHeight = calculateHeight(state)

  return (
    <div
      className="bg-white border-t border-gray-200 rounded-t-2xl shadow-lg flex flex-col"
      style={{ height: `${currentHeight}px` }}
    >
      {/* Grab Handle */}
      <div
        className="flex items-center justify-center h-12 cursor-pointer select-none touch-none border-b border-gray-200"
        onClick={state === 'collapsed' ? handleHeaderClick : undefined}
        aria-label="Tap to expand results"
      >
        <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
      </div>

      {/* Sheet Header */}
      <div className={`flex-shrink-0 px-4 border-b border-gray-200 ${state === 'collapsed' ? 'py-2' : 'py-3'}`}>
        <div className="flex items-center justify-between min-h-[44px]">
          <h2 
            className="text-base font-semibold truncate flex-1 min-w-0 cursor-pointer"
            onClick={state === 'collapsed' ? handleHeaderClick : undefined}
          >
            Results near you ({sales.length})
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {state === 'collapsed' && (
              <button
                onClick={handleHeaderClick}
                className="text-sm text-gray-600 hover:text-gray-900 underline min-h-[44px] px-2 whitespace-nowrap"
                aria-label="Show more results"
              >
                Show more
              </button>
            )}
            {state !== 'collapsed' && (
              <button
                onClick={handleShowLess}
                className="text-sm text-gray-600 hover:text-gray-900 underline min-h-[44px] px-2 whitespace-nowrap"
                aria-label="Show less results"
              >
                Show less
              </button>
            )}
            {state === 'half' && (
              <button
                onClick={() => onStateChange('full')}
                className="text-sm text-gray-600 hover:text-gray-900 underline min-h-[44px] px-2 whitespace-nowrap"
                aria-label="Expand to full screen"
              >
                Expand
              </button>
            )}
            {selectedPinId && (
              <button
                onClick={onClearSelection}
                className="text-sm text-blue-600 hover:text-blue-800 underline min-h-[44px] px-2 whitespace-nowrap"
              >
                Show All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sheet Content - Scrollable */}
      {state !== 'collapsed' && (
        <div 
          className="flex-1 overflow-y-auto touch-pan-y"
          style={{ 
            height: `${currentHeight - 108}px` // Account for handle (48px) + header (~60px)
          }}
        >
          {loading && (
            <div className="grid grid-cols-1 gap-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SaleCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!loading && sales.length === 0 && (
            <div className="text-center py-8 px-4">
              <div className="text-gray-500">
                No sales found in this area
              </div>
            </div>
          )}

          {!loading && sales.length > 0 && (
            <div className="p-4">
              <SalesList 
                sales={sales} 
                _mode="grid" 
                viewport={mapView || { center: { lat: 39.8283, lng: -98.5795 }, zoom: 10 }}
                isLoading={loading}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

