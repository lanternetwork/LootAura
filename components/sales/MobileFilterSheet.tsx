'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { buildDatePresets } from '@/lib/shared/datePresets'

// Category data
const CATEGORY_DATA = [
  { id: 'Furniture', label: 'Furniture' },
  { id: 'Electronics', label: 'Electronics' },
  { id: 'Clothing', label: 'Clothing' },
  { id: 'Books', label: 'Books' },
  { id: 'Toys', label: 'Toys' },
  { id: 'Tools', label: 'Tools' },
  { id: 'Sports', label: 'Sports' },
  { id: 'Home & Garden', label: 'Home & Garden' },
  { id: 'Antiques', label: 'Antiques' },
  { id: 'Collectibles', label: 'Collectibles' }
]

type MobileFilterSheetProps = {
  isOpen: boolean
  onClose: () => void
  dateRange: 'today' | 'thursday' | 'friday' | 'saturday' | 'sunday' | 'this_weekend' | 'weekend' | 'next_weekend' | 'any'
  onDateRangeChange: (dateRange: 'today' | 'thursday' | 'friday' | 'saturday' | 'sunday' | 'this_weekend' | 'weekend' | 'next_weekend' | 'any') => void
  categories: string[]
  onCategoriesChange: (categories: string[]) => void
  distance: number
  onDistanceChange: (distance: number) => void
  hasActiveFilters: boolean
  isLoading?: boolean
  onClearFilters?: () => void
}

export default function MobileFilterSheet({
  isOpen,
  onClose,
  dateRange,
  onDateRangeChange,
  categories,
  onCategoriesChange,
  distance,
  onDistanceChange,
  hasActiveFilters: _hasActiveFilters,
  isLoading = false,
  onClearFilters
}: MobileFilterSheetProps) {
  const [tempDateRange, setTempDateRange] = useState(dateRange)
  const [tempCategories, setTempCategories] = useState(categories)
  const [tempDistance, setTempDistance] = useState(distance)
  const [swipeStartY, setSwipeStartY] = useState<number | null>(null)
  const [swipeDeltaY, setSwipeDeltaY] = useState(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  // Track last synced props to detect external changes
  const lastSyncedPropsRef = useRef<{
    dateRange: typeof dateRange
    categories: string[]
    distance: number
  } | null>(null)

  // Swipe-to-dismiss gesture handling (only on drag handle area)
  const handleDragHandleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation()
    setSwipeStartY(e.touches[0].clientY)
    setSwipeDeltaY(0)
  }, [])

  const handleDragHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeStartY === null) return
    e.preventDefault()
    e.stopPropagation()
    const currentY = e.touches[0].clientY
    const delta = currentY - swipeStartY
    // Only allow downward swipes (positive delta)
    if (delta > 0) {
      setSwipeDeltaY(delta)
    }
  }, [swipeStartY])

  const handleDragHandleTouchEnd = useCallback(() => {
    // If swiped down more than 100px, dismiss the sheet
    if (swipeDeltaY > 100) {
      onClose()
    }
    setSwipeStartY(null)
    setSwipeDeltaY(0)
  }, [swipeDeltaY, onClose])

  // Date presets - only show Thu/Fri/Sat/Sun/This weekend (skip Today)
  const datePresets = useMemo(() => {
    const allPresets = buildDatePresets()
    // Filter to only show: thursday, friday, saturday, sunday, this_weekend
    return allPresets.filter(p => 
      ['thursday', 'friday', 'saturday', 'sunday', 'this_weekend'].includes(p.id)
    )
  }, [])

  // Sync temp state from props only when:
  // 1. Sheet opens for the first time, OR
  // 2. Props have changed externally (e.g., after Apply or external filter update)
  // This preserves user's uncommitted selections when closing/reopening without applying
  useEffect(() => {
    if (isOpen) {
      const lastSynced = lastSyncedPropsRef.current
      const propsChanged = !lastSynced ||
        lastSynced.dateRange !== dateRange ||
        lastSynced.categories.length !== categories.length ||
        !lastSynced.categories.every((cat, i) => cat === categories[i]) ||
        lastSynced.distance !== distance
      
      if (propsChanged) {
        // Props changed externally (e.g., after Apply) or first open: sync from props
        setTempDateRange(dateRange)
        setTempCategories(categories)
        setTempDistance(distance)
        lastSyncedPropsRef.current = { dateRange, categories: [...categories], distance }
      }
      // If props haven't changed, preserve temp state (user's uncommitted selections)
    }
  }, [isOpen, dateRange, categories, distance])

  const handleCategoryToggle = useCallback((categoryId: string) => {
    if (tempCategories.includes(categoryId)) {
      setTempCategories(tempCategories.filter(c => c !== categoryId))
    } else {
      setTempCategories([...tempCategories, categoryId])
    }
  }, [tempCategories])

  const handleApply = useCallback(() => {
    // Update filters - this will trigger map viewport change and fetch
    onDateRangeChange(tempDateRange)
    onCategoriesChange(tempCategories)
    onDistanceChange(tempDistance)
    onClose()
  }, [tempDateRange, tempCategories, tempDistance, onDateRangeChange, onCategoriesChange, onDistanceChange, onClose])

  const handleReset = useCallback(() => {
    setTempDateRange('any')
    setTempCategories([])
    setTempDistance(25)
  }, [])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-lg z-50 md:hidden max-h-[85vh] overflow-hidden flex flex-col will-change-transform transition-transform duration-200"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: swipeDeltaY > 0 ? `translateY(${swipeDeltaY}px)` : 'translateY(0)',
        }}
      >
        {/* Drag Handle */}
        <div 
          className="flex items-center justify-center h-12 cursor-grab active:cursor-grabbing border-b border-gray-200 select-none touch-none"
          aria-label="Drag handle - swipe down to close"
          onTouchStart={handleDragHandleTouchStart}
          onTouchMove={handleDragHandleTouchMove}
          onTouchEnd={handleDragHandleTouchEnd}
        >
          <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filters</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close filters"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 touch-pan-y">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium mb-3">Date Range</label>
            <select
              value={tempDateRange}
              onChange={(e) => setTempDateRange(e.target.value as any)}
              disabled={isLoading}
              className={`w-full px-3 py-2 border rounded-md ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value="any">Any Date</option>
              {datePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-sm font-medium mb-3">Categories</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_DATA.map((category) => {
                const isSelected = tempCategories.includes(category.id)
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryToggle(category.id)}
                    disabled={isLoading}
                    className={`
                      px-4 py-2.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap min-h-[44px]
                      ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                      ${isSelected 
                        ? 'bg-[rgba(147,51,234,0.15)] text-[#3A2268] border border-purple-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                      }
                    `}
                  >
                    {category.label}
                    {isSelected && <span className="ml-1 text-[var(--accent-primary)]">×</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Distance / Search Area */}
          <div>
            <label className="block text-sm font-medium mb-3">Search Area</label>
            <select
              value={tempDistance}
              onChange={(e) => setTempDistance(Number(e.target.value))}
              disabled={isLoading}
              className={`w-full px-3 py-2 border rounded-md ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value={10}>10 miles</option>
              <option value={2}>2 miles</option>
              <option value={5}>5 miles</option>
              <option value={25}>25 miles</option>
            </select>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 flex gap-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {onClearFilters && (
            <button
              onClick={() => {
                onClearFilters()
                onClose()
              }}
              disabled={isLoading}
              className="px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium transition-colors min-h-[44px] hover:bg-gray-50"
              aria-label="Clear all filters"
            >
              Clear All
            </button>
          )}
          <button
            onClick={handleReset}
            disabled={isLoading}
            aria-label="Reset filters to default values"
            className={`${onClearFilters ? 'flex-1' : 'flex-1'} px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
            }`}
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            disabled={isLoading}
            aria-label={isLoading ? 'Applying filters...' : 'Apply selected filters'}
            className={`flex-1 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              isLoading ? 'opacity-50 cursor-not-allowed btn-accent' : 'btn-accent'
            }`}
          >
            {isLoading ? 'Applying...' : 'Apply Filters'}
          </button>
        </div>
      </div>
    </>
  )
}

