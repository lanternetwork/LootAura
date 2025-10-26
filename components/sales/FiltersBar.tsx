'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ZipInput from '@/components/location/ZipInput'

type FiltersBarProps = {
  // ZIP Search
  onZipLocationFound: (lat: number, lng: number, _city?: string, _state?: string, _zip?: string, bbox?: [number, number, number, number]) => void
  onZipError: (error: string) => void
  zipError?: string | null
  
  // Date Filter
  dateRange: 'today' | 'weekend' | 'next_weekend' | 'any'
  onDateRangeChange: (dateRange: 'today' | 'weekend' | 'next_weekend' | 'any') => void
  
  // Category Filter
  categories: string[]
  onCategoriesChange: (categories: string[]) => void
  
  // Distance Filter
  distance: number
  onDistanceChange: (distance: number) => void
  
  // Advanced Filters
  onAdvancedFiltersOpen: () => void
  hasActiveFilters: boolean
  
  // Loading state for visual feedback
  isLoading?: boolean
  
  // Test IDs for different layouts
  zipInputTestId?: string
  filtersCenterTestId?: string
  filtersMoreTestId?: string
}

// Category data with priority for overflow management
const CATEGORY_DATA = [
  { id: 'Furniture', label: 'Furniture', priority: 10 },
  { id: 'Electronics', label: 'Electronics', priority: 9 },
  { id: 'Clothing', label: 'Clothing', priority: 8 },
  { id: 'Books', label: 'Books', priority: 7 },
  { id: 'Toys', label: 'Toys', priority: 6 },
  { id: 'Tools', label: 'Tools', priority: 5 },
  { id: 'Sports', label: 'Sports', priority: 4 },
  { id: 'Home & Garden', label: 'Home & Garden', priority: 3 },
  { id: 'Antiques', label: 'Antiques', priority: 2 },
  { id: 'Collectibles', label: 'Collectibles', priority: 1 }
]

// Chip overflow hook
function useChipOverflow(allChips: typeof CATEGORY_DATA, centerEl: HTMLElement | null, measureEl: HTMLElement | null) {
  const [visible, setVisible] = useState<typeof CATEGORY_DATA>([])
  const [overflow, setOverflow] = useState<typeof CATEGORY_DATA>([])
  const [_widthCache, _setWidthCache] = useState<Record<string, number>>({})
  const [hysteresis, setHysteresis] = useState<{ count: number; lastResult: { visible: typeof CATEGORY_DATA; overflow: typeof CATEGORY_DATA } }>({ count: 0, lastResult: { visible: [], overflow: [] } })
  const isMountedRef = useRef(true)

  const measure = useCallback(() => {
    if (!centerEl || !measureEl || !isMountedRef.current) return

    const centerWidth = centerEl.clientWidth
    if (centerWidth <= 0) {
      // SSR/hydration case - put all chips in overflow
      if (isMountedRef.current) {
        setVisible([])
        setOverflow(allChips)
      }
      return
    }

    const available = centerWidth - 8 // paddingSafety = 8
    const gap = 8 // gap-2 in Tailwind

    // Measure individual chip widths from offscreen measurer
    const measureChips = measureEl.querySelectorAll('li[data-chip]')
    const newWidthCache: Record<string, number> = {}
    
    measureChips.forEach((chipEl, idx) => {
      const chip = allChips[idx]
      if (chip) {
        newWidthCache[chip.id] = Math.ceil(chipEl.getBoundingClientRect().width)
      }
    })
    _setWidthCache(newWidthCache)

    // Greedily accumulate chips until sum exceeds available
    let used = 0
    const nextVisible: typeof CATEGORY_DATA = []
    const nextOverflow: typeof CATEGORY_DATA = []

    allChips.forEach((chip) => {
      const width = newWidthCache[chip.id] ?? 0
      const widthWithGap = nextVisible.length === 0 ? width : width + gap
      
      if (used + widthWithGap <= available) {
        nextVisible.push(chip)
        used += widthWithGap
      } else {
        nextOverflow.push(chip)
      }
    })

    // Hysteresis: require 2 consecutive identical computations
    const currentResult = { visible: nextVisible, overflow: nextOverflow }
    const isSameResult = 
      currentResult.visible.length === hysteresis.lastResult.visible.length &&
      currentResult.overflow.length === hysteresis.lastResult.overflow.length &&
      currentResult.visible.every((item, index) => item.id === hysteresis.lastResult.visible[index]?.id) &&
      currentResult.overflow.every((item, index) => item.id === hysteresis.lastResult.overflow[index]?.id)

    if (!isMountedRef.current) return

    if (isSameResult) {
      // Same result - reset counter and apply immediately
      setHysteresis({ count: 0, lastResult: currentResult })
      setVisible(nextVisible)
      setOverflow(nextOverflow)
    } else {
      const newCount = hysteresis.count + 1
      setHysteresis({ count: newCount, lastResult: currentResult })
      
      if (newCount >= 2) {
        setVisible(nextVisible)
        setOverflow(nextOverflow)
        setHysteresis({ count: 0, lastResult: currentResult })
      }
    }

    // Debug logging - only log when result actually changes and in debug mode
    if (process.env.NEXT_PUBLIC_DEBUG === 'true' && !isSameResult) {
      console.log(`[OVERFLOW] centerWidth=${centerWidth} visible=${nextVisible.length} overflow=${nextOverflow.length} sum=${used} available=${available}`)
    }
  }, [allChips, centerEl, measureEl, hysteresis])

  useEffect(() => {
    if (!centerEl) return

    let timeoutId: NodeJS.Timeout
    const debouncedMeasure = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(measure, 50) // 20fps - more reasonable for overflow calculations
    }

    const ro = new ResizeObserver(debouncedMeasure)
    ro.observe(centerEl)
    
    // Initial measurement
    requestAnimationFrame(measure)
    
    return () => {
      clearTimeout(timeoutId)
      ro.disconnect()
    }
  }, [measure])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  return { visible, overflow }
}

export default function FiltersBar({
  onZipLocationFound,
  onZipError,
  zipError,
  dateRange,
  onDateRangeChange,
  categories,
  onCategoriesChange,
  distance,
  onDistanceChange,
  onAdvancedFiltersOpen,
  hasActiveFilters,
  isLoading = false,
  zipInputTestId = "zip-input",
  filtersCenterTestId = "filters-center",
  filtersMoreTestId = "filters-more"
}: FiltersBarProps) {
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  
  // Refs for the 3-column layout
  const zipRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const chipsRailRef = useRef<HTMLUListElement>(null)
  const measureRef = useRef<HTMLUListElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  // Chip overflow management
  const { visible, overflow } = useChipOverflow(CATEGORY_DATA, centerRef.current, measureRef.current)

  const handleCategoryToggle = (categoryId: string) => {
    if (categories.includes(categoryId)) {
      onCategoriesChange(categories.filter(c => c !== categoryId))
    } else {
      onCategoriesChange([...categories, categoryId])
    }
  }

  const toggleOverflowMenu = () => {
    if (overflow.length > 0) {
      setShowOverflowMenu(!showOverflowMenu)
    } else {
      onAdvancedFiltersOpen()
    }
  }

  // Close overflow menu on outside click or escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showOverflowMenu && !(event.target as Element).closest('[data-overflow-menu]')) {
        setShowOverflowMenu(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showOverflowMenu) {
        setShowOverflowMenu(false)
      }
    }

    if (showOverflowMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showOverflowMenu])

  return (
    <div className="border-b bg-white">
      {/* Desktop/Tablet Layout - 3 Column Grid */}
      <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3 px-4 h-12 hidden md:grid">
        {/* Left: ZIP */}
        <div ref={zipRef} className="shrink-0 flex items-center gap-2 w-[260px] md:w-[320px]">
          <ZipInput
            onLocationFound={onZipLocationFound}
            onError={onZipError}
            placeholder="ZIP code"
            className="flex-1"
            data-testid={zipInputTestId}
          />
          {zipError && (
            <span className="text-red-500 text-xs">{zipError}</span>
          )}
        </div>

        {/* Center: category chips (fluid) */}
        <div ref={centerRef} data-testid={filtersCenterTestId} className="min-w-0 overflow-hidden">
          <ul ref={chipsRailRef} className="flex items-center gap-2">
            {visible.map((category) => {
              const isSelected = categories.includes(category.id)
              return (
                <li key={category.id} data-chip={category.id}>
                  <button
                    onClick={() => handleCategoryToggle(category.id)}
                    disabled={isLoading}
                    className={`
                      shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                      ${isLoading 
                        ? 'opacity-50 cursor-not-allowed' 
                        : ''
                      }
                      ${isSelected 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                      }
                    `}
                  >
                    {isLoading && isSelected ? (
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        {category.label}
                      </div>
                    ) : (
                      <>
                        {category.label}
                        {isSelected && (
                          <span className="ml-1 text-blue-600">×</span>
                        )}
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          
          {/* Offscreen measurer for all chips */}
          <ul
            ref={measureRef}
            className="absolute left-[-9999px] top-0 invisible flex items-center gap-2"
            aria-hidden
          >
            {CATEGORY_DATA.map((category) => (
              <li key={category.id} data-chip={category.id}>
                <button className="shrink-0 px-3 py-1.5 border rounded-full text-sm">
                  {category.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: Distance + More */}
        <div ref={rightRef} className="shrink-0 flex items-center gap-3 ml-auto">
          {/* Search Area select */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Search Area:</label>
            <select
              value={distance}
              onChange={(e) => onDistanceChange(Number(e.target.value))}
              disabled={isLoading}
              className={`px-2 py-1 border rounded text-sm min-w-[80px] ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value={2}>2 mi</option>
              <option value={5}>5 mi</option>
              <option value={10}>10 mi</option>
              <option value={25}>25 mi</option>
              <option value={50}>50 mi</option>
              <option value={100}>100 mi</option>
            </select>
          </div>

          {/* More Filters button (existing) - overflow host */}
          <div className="relative">
            <button
              onClick={toggleOverflowMenu}
              data-testid={filtersMoreTestId}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 bg-white hover:bg-gray-50 rounded-md transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {overflow.length > 0 ? `More (${overflow.length})` : 'More Filters'}
              {hasActiveFilters && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
            </button>

            {/* Overflow menu popover */}
            {showOverflowMenu && overflow.length > 0 && (
              <div data-overflow-menu className="absolute right-0 top-full mt-2 w-64 rounded-lg border bg-white shadow-lg z-50">
                <div className="p-2 flex flex-wrap gap-2">
                  {overflow.map((category) => {
                    const isSelected = categories.includes(category.id)
                    return (
                      <button
                        key={category.id}
                        onClick={() => handleCategoryToggle(category.id)}
                        className={`
                          shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                          ${isSelected 
                            ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                            : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                          }
                        `}
                      >
                        {category.label}
                        {isSelected && (
                          <span className="ml-1 text-blue-600">×</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 px-4 py-2">
          {/* ZIP Search - Compact */}
          <div className="flex-1">
            <ZipInput
              onLocationFound={onZipLocationFound}
              onError={onZipError}
              placeholder="ZIP"
              className="w-full"
              data-testid="zip-input-mobile"
            />
            {zipError && (
              <span className="text-red-500 text-xs">{zipError}</span>
            )}
          </div>

          {/* Date Dropdown - Compact */}
          <select
            value={dateRange}
            onChange={(e) => onDateRangeChange(e.target.value as 'today' | 'weekend' | 'next_weekend' | 'any')}
            disabled={isLoading}
            className={`px-2 py-1 border rounded text-xs min-w-[80px] ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <option value="any">Any</option>
            <option value="today">Today</option>
            <option value="weekend">Weekend</option>
            <option value="next_weekend">Next</option>
          </select>

          {/* Search Area - Compact */}
          <select
            value={distance}
            onChange={(e) => onDistanceChange(Number(e.target.value))}
            disabled={isLoading}
            className={`px-2 py-1 border rounded text-xs min-w-[60px] ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <option value={2}>2mi</option>
            <option value={5}>5mi</option>
            <option value={10}>10mi</option>
            <option value={25}>25mi</option>
            <option value={50}>50mi</option>
            <option value={100}>100mi</option>
          </select>

          {/* More Filters Button */}
          <button
            onClick={() => setShowMobileFilters(true)}
            className="flex items-center gap-1 px-2 py-1 border border-gray-300 bg-white hover:bg-gray-50 rounded text-sm"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {hasActiveFilters && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
          </button>
        </div>
      </div>

      {/* Mobile Filters Modal */}
      {showMobileFilters && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 md:hidden">
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-lg max-h-[80vh] overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Filters</h2>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                {/* Date Selector */}
                <div>
                  <label className="block text-sm font-medium mb-2">Date Range</label>
                  <select
                    value={dateRange}
                    onChange={(e) => onDateRangeChange(e.target.value as 'today' | 'weekend' | 'next_weekend' | 'any')}
                    disabled={isLoading}
                    className={`w-full px-3 py-2 border rounded-md ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <option value="any">Any Date</option>
                    <option value="today">Today</option>
                    <option value="weekend">This Weekend</option>
                    <option value="next_weekend">Next Weekend</option>
                  </select>
                </div>

                {/* Category Chips */}
                <div>
                  <label className="block text-sm font-medium mb-2">Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_DATA.map((category) => {
                      const isSelected = categories.includes(category.id)
                      return (
                        <button
                          key={category.id}
                          onClick={() => handleCategoryToggle(category.id)}
                          className={`
                            shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                            ${isSelected 
                              ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                              : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                            }
                          `}
                        >
                          {category.label}
                          {isSelected && (
                            <span className="ml-1 text-blue-600">×</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Search Area Filter */}
                <div>
                  <label className="block text-sm font-medium mb-2">Search Area</label>
                  <select
                    value={distance}
                    onChange={(e) => onDistanceChange(Number(e.target.value))}
                    disabled={isLoading}
                    className={`w-full px-3 py-2 border rounded-md ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <option value={2}>2 miles</option>
                    <option value={5}>5 miles</option>
                    <option value={10}>10 miles</option>
                    <option value={25}>25 miles</option>
                    <option value={50}>50 miles</option>
                    <option value={100}>100 miles</option>
                  </select>
                </div>

                {/* Advanced Filters */}
                <button
                  onClick={() => {
                    setShowMobileFilters(false)
                    onAdvancedFiltersOpen()
                  }}
                  className="w-full px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 rounded-md transition-colors"
                >
                  Advanced Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
