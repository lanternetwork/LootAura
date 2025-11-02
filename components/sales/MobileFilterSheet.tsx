'use client'

import { useState, useCallback, useEffect } from 'react'

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
  dateRange: 'today' | 'weekend' | 'next_weekend' | 'any'
  onDateRangeChange: (dateRange: 'today' | 'weekend' | 'next_weekend' | 'any') => void
  categories: string[]
  onCategoriesChange: (categories: string[]) => void
  distance: number
  onDistanceChange: (distance: number) => void
  hasActiveFilters: boolean
  isLoading?: boolean
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
  hasActiveFilters,
  isLoading = false
}: MobileFilterSheetProps) {
  const [tempDateRange, setTempDateRange] = useState(dateRange)
  const [tempCategories, setTempCategories] = useState(categories)
  const [tempDistance, setTempDistance] = useState(distance)

  // Sync temp state when sheet opens or props change
  useState(() => {
    if (isOpen) {
      setTempDateRange(dateRange)
      setTempCategories(categories)
      setTempDistance(distance)
    }
  })

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
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-lg z-50 md:hidden max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className="flex items-center justify-center h-12 cursor-grab active:cursor-grabbing border-b border-gray-200 select-none">
          <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filters</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close filters"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium mb-3">Date Range</label>
            <select
              value={tempDateRange}
              onChange={(e) => setTempDateRange(e.target.value as 'today' | 'weekend' | 'next_weekend' | 'any')}
              disabled={isLoading}
              className={`w-full px-3 py-2 border rounded-md ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value="any">Any Date</option>
              <option value="today">Today</option>
              <option value="weekend">This Weekend</option>
              <option value="next_weekend">Next Weekend</option>
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
                      px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                      ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                      ${isSelected 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                      }
                    `}
                  >
                    {category.label}
                    {isSelected && <span className="ml-1 text-blue-600">×</span>}
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
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={handleReset}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium transition-colors ${
              isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
            }`}
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors ${
              isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'
            }`}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  )
}

