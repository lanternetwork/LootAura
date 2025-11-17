'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { buildDatePresets } from '@/lib/shared/datePresets'
import ZipInput from '@/components/location/ZipInput'
import { DateRangeType } from '@/lib/hooks/useFilters'

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

interface MobileFiltersModalProps {
  isOpen: boolean
  onClose: () => void
  dateRange: DateRangeType
  onDateRangeChange: (dateRange: DateRangeType) => void
  categories: string[]
  onCategoriesChange: (categories: string[]) => void
  distance: number
  onDistanceChange: (distance: number) => void
  hasActiveFilters: boolean
  isLoading?: boolean
  onClearFilters?: () => void
  onZipLocationFound: (lat: number, lng: number, city?: string, state?: string, zip?: string, bbox?: [number, number, number, number]) => void
  onZipError: (error: string) => void
  zipError?: string | null
}

/**
 * Full-screen mobile filters modal for the new mobile sales experience.
 * Replaces the persistent filter bar with a modal that can be opened via FAB.
 */
export default function MobileFiltersModal({
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
  onClearFilters,
  onZipLocationFound,
  onZipError,
  zipError
}: MobileFiltersModalProps) {
  const [tempDateRange, setTempDateRange] = useState(dateRange)
  const [tempCategories, setTempCategories] = useState(categories)
  const [tempDistance, setTempDistance] = useState(distance)

  // Date presets - only show Thu/Fri/Sat/Sun/This weekend (skip Today)
  const datePresets = useMemo(() => {
    const allPresets = buildDatePresets()
    return allPresets.filter(p => 
      ['thursday', 'friday', 'saturday', 'sunday', 'this_weekend'].includes(p.id)
    )
  }, [])

  // Sync temp state when modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setTempDateRange(dateRange)
      setTempCategories(categories)
      setTempDistance(distance)
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

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 md:hidden"
        onClick={onClose}
      />

      {/* Full-screen modal */}
      <div
        className="fixed inset-0 bg-white z-50 md:hidden flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Filters</h2>
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

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 touch-pan-y">
          {/* ZIP Search */}
          <div>
            <label className="block text-sm font-medium mb-2">Location</label>
            {zipError && (
              <div className="mb-2 text-sm text-red-600">{zipError}</div>
            )}
            <ZipInput
              onLocationFound={onZipLocationFound}
              onError={onZipError}
            />
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium mb-3">Date Range</label>
            <select
              value={tempDateRange}
              onChange={(e) => setTempDateRange(e.target.value as DateRangeType)}
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
              <option value={2}>2 miles</option>
              <option value={5}>5 miles</option>
              <option value={10}>10 miles</option>
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



