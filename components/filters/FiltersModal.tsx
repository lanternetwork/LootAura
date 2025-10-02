'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
// Simple SVG icons
const CloseIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const MapMarkerIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const CalendarIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const TagsIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
)
import DateSelector, { DateRange } from './DateSelector'

interface FiltersModalProps {
  isOpen: boolean
  onClose: () => void
  className?: string
}

interface FilterState {
  distance: number
  dateRange: DateRange
  categories: string[]
}

const CATEGORY_OPTIONS = [
  { value: 'tools', label: 'Tools', icon: '🔧' },
  { value: 'toys', label: 'Toys', icon: '🧸' },
  { value: 'furniture', label: 'Furniture', icon: '🪑' },
  { value: 'electronics', label: 'Electronics', icon: '📱' },
  { value: 'clothing', label: 'Clothing', icon: '👕' },
  { value: 'books', label: 'Books', icon: '📚' },
  { value: 'sports', label: 'Sports', icon: '⚽' },
  { value: 'home', label: 'Home & Garden', icon: '🏠' },
  { value: 'automotive', label: 'Automotive', icon: '🚗' },
  { value: 'collectibles', label: 'Collectibles', icon: '🎯' },
  { value: 'antiques', label: 'Antiques', icon: '🏺' },
  { value: 'misc', label: 'Miscellaneous', icon: '📦' }
]

export default function FiltersModal({ isOpen, onClose, className = '' }: FiltersModalProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<FilterState>({
    distance: 25,
    dateRange: { type: 'any' },
    categories: []
  })

  // Initialize filters from URL params
  useEffect(() => {
    const distance = searchParams.get('dist') ? parseInt(searchParams.get('dist')!) : 25
    const dateType = searchParams.get('date') || 'any'
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const categories = searchParams.get('cat') ? searchParams.get('cat')!.split(',') : []

    setFilters({
      distance: Math.max(1, Math.min(100, distance)),
      dateRange: { 
        type: dateType as DateRange['type'], 
        startDate, 
        endDate 
      },
      categories
    })
  }, [searchParams])

  const updateFilters = (newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters }
    setFilters(updatedFilters)
    
    // Update URL with new filters
    const params = new URLSearchParams(searchParams.toString())
    
    // Update distance
    if (updatedFilters.distance !== 25) {
      params.set('dist', updatedFilters.distance.toString())
    } else {
      params.delete('dist')
    }
    
    // Update date range
    if (updatedFilters.dateRange.type !== 'any') {
      params.set('date', updatedFilters.dateRange.type)
      if (updatedFilters.dateRange.startDate) {
        params.set('startDate', updatedFilters.dateRange.startDate)
      }
      if (updatedFilters.dateRange.endDate) {
        params.set('endDate', updatedFilters.dateRange.endDate)
      }
    } else {
      params.delete('date')
      params.delete('startDate')
      params.delete('endDate')
    }
    
    // Update categories
    if (updatedFilters.categories.length > 0) {
      params.set('cat', updatedFilters.categories.join(','))
    } else {
      params.delete('cat')
    }
    
    // Update URL
    const newUrl = `${window.location.pathname}?${params.toString()}`
    router.push(newUrl)
  }

  const handleDistanceChange = (distance: number) => {
    updateFilters({ distance })
  }

  const handleDateRangeChange = (dateRange: DateRange) => {
    updateFilters({ dateRange })
  }

  const handleCategoryToggle = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category]
    
    updateFilters({ categories: newCategories })
  }

  const handleClearFilters = () => {
    updateFilters({
      distance: 25,
      dateRange: { type: 'any' },
      categories: []
    })
  }

  const hasActiveFilters = filters.distance !== 25 || filters.dateRange.type !== 'any' || filters.categories.length > 0

  return (
    <>
      {/* Mobile Modal Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile Modal */}
      <div className={`md:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-xl shadow-2xl z-50 transform transition-transform duration-300 ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}>
        <div className="p-6">
          {/* Mobile Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Filters</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <CloseIcon />
            </button>
          </div>

          <FiltersContent 
            filters={filters}
            onDistanceChange={handleDistanceChange}
            onDateRangeChange={handleDateRangeChange}
            onCategoryToggle={handleCategoryToggle}
            onClearFilters={handleClearFilters}
            hasActiveFilters={hasActiveFilters}
          />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className={`hidden md:block ${className}`}>
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear All
              </button>
            )}
          </div>

          <FiltersContent 
            filters={filters}
            onDistanceChange={handleDistanceChange}
            onDateRangeChange={handleDateRangeChange}
            onCategoryToggle={handleCategoryToggle}
            onClearFilters={handleClearFilters}
            hasActiveFilters={hasActiveFilters}
          />
        </div>
      </div>
    </>
  )
}

interface FiltersContentProps {
  filters: FilterState
  onDistanceChange: (distance: number) => void
  onDateRangeChange: (dateRange: DateRange) => void
  onCategoryToggle: (category: string) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
}

function FiltersContent({
  filters,
  onDistanceChange,
  onDateRangeChange,
  onCategoryToggle,
  onClearFilters,
  hasActiveFilters
}: FiltersContentProps) {
  return (
    <div className="space-y-6">
      {/* Distance Filter */}
      <div>
        <div className="flex items-center mb-3">
          <MapMarkerIcon />
          <span className="text-gray-500 mr-2"></span>
          <label className="text-sm font-medium text-gray-700">
            Distance: {filters.distance} miles
          </label>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={filters.distance}
          onChange={(e) => onDistanceChange(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1 mi</span>
          <span>100 mi</span>
        </div>
      </div>

      {/* Date Range Filter */}
      <div>
        <div className="flex items-center mb-3">
          <CalendarIcon />
          <span className="text-gray-500 mr-2"></span>
          <label className="text-sm font-medium text-gray-700">Date Range</label>
        </div>
        <DateSelector
          value={filters.dateRange}
          onChange={onDateRangeChange}
        />
      </div>

      {/* Categories Filter */}
      <div>
        <div className="flex items-center mb-3">
          <TagsIcon />
          <span className="text-gray-500 mr-2"></span>
          <label className="text-sm font-medium text-gray-700">Categories</label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_OPTIONS.map((category) => (
            <label
              key={category.value}
              className={`flex items-center p-2 rounded-lg border cursor-pointer transition-colors ${
                filters.categories.includes(category.value)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={filters.categories.includes(category.value)}
                onChange={() => onCategoryToggle(category.value)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm font-medium">{category.icon}</span>
              <span className="ml-1 text-sm">{category.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            <strong>Active filters:</strong>
            <ul className="mt-1 space-y-1">
              {filters.distance !== 25 && (
                <li>• Distance: {filters.distance} miles</li>
              )}
              {filters.dateRange.type !== 'any' && (
                <li>• Date: {filters.dateRange.type === 'today' ? 'Today' : 
                            filters.dateRange.type === 'weekend' ? 'This Weekend' :
                            filters.dateRange.type === 'next_weekend' ? 'Next Weekend' :
                            'Custom Range'}</li>
              )}
              {filters.categories.length > 0 && (
                <li>• Categories: {filters.categories.length} selected</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
