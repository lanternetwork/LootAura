'use client'

import { useState } from 'react'
import ZipInput from '@/components/location/ZipInput'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Filter } from 'lucide-react'
import { useOverflowChips } from '@/hooks/useOverflowChips'
import MoreChipsMenu from '@/components/filters/MoreChipsMenu'

type FiltersBarProps = {
  // ZIP Search
  onZipLocationFound: (lat: number, lng: number, _city?: string, _state?: string, _zip?: string) => void
  onZipError: (error: string) => void
  zipError?: string
  
  // Date Filter
  dateRange: string
  onDateRangeChange: (dateRange: string) => void
  
  // Category Filter
  categories: string[]
  onCategoriesChange: (categories: string[]) => void
  
  // Distance Filter
  distance: number
  onDistanceChange: (distance: number) => void
  
  // Advanced Filters
  onAdvancedFiltersOpen: () => void
  hasActiveFilters: boolean
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
  hasActiveFilters
}: FiltersBarProps) {
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Overflow management for category chips
  const { railRef, visible, overflow } = useOverflowChips(CATEGORY_DATA)

  const handleCategoryToggle = (categoryId: string) => {
    if (categories.includes(categoryId)) {
      onCategoriesChange(categories.filter(c => c !== categoryId))
    } else {
      onCategoriesChange([...categories, categoryId])
    }
  }

  return (
    <div className="border-b bg-white">
      {/* Desktop/Tablet Layout - Single Row Zillow-style */}
      <div className="hidden md:flex items-center gap-3 px-3 py-3">
        {/* Left Group - ZIP Search (Fixed) */}
        <div className="flex items-center gap-2 flex-none w-[240px] sm:w-[280px] md:w-[320px]">
          <ZipInput
            onLocationFound={onZipLocationFound}
            onError={onZipError}
            placeholder="ZIP code"
            className="flex-1"
          />
          {zipError && (
            <span className="text-red-500 text-xs">{zipError}</span>
          )}
        </div>

        {/* Center Group - Category Chips with Overflow Management */}
        <div className="flex-1 min-w-[240px]">
          <div className="relative overflow-hidden">
            <div ref={railRef} className="flex items-center gap-2 whitespace-nowrap">
              {visible.map((category) => {
                const isSelected = categories.includes(category.id)
                return (
                  <button
                    key={category.id}
                    data-role="chip"
                    onClick={() => handleCategoryToggle(category.id)}
                    className={`
                      inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap
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
              {overflow.length > 0 && (
                <MoreChipsMenu 
                  count={overflow.length}
                  items={overflow}
                  selectedCategories={categories}
                  onToggle={handleCategoryToggle}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right Group - Distance + More Filters (Fixed) */}
        <div className="ml-auto flex items-center gap-2 flex-none">
          {/* Distance Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Distance:</label>
            <select
              value={distance}
              onChange={(e) => onDistanceChange(Number(e.target.value))}
              className="px-2 py-1 border rounded text-sm min-w-[80px]"
            >
              <option value={5}>5 mi</option>
              <option value={10}>10 mi</option>
              <option value={25}>25 mi</option>
              <option value={50}>50 mi</option>
              <option value={100}>100 mi</option>
            </select>
          </div>

          {/* More Filters Button */}
          <Button
            variant="outline"
            onClick={onAdvancedFiltersOpen}
            className="flex items-center gap-1 px-3 py-1 text-sm"
          >
            <Filter className="h-4 w-4" />
            More
            {hasActiveFilters && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
          </Button>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          {/* ZIP Search - Compact */}
          <div className="flex-1">
            <ZipInput
              onLocationFound={onZipLocationFound}
              onError={onZipError}
              placeholder="ZIP"
              className="w-full"
            />
            {zipError && (
              <span className="text-red-500 text-xs">{zipError}</span>
            )}
          </div>

          {/* Date Dropdown - Compact */}
          <select
            value={dateRange}
            onChange={(e) => onDateRangeChange(e.target.value)}
            className="px-2 py-1 border rounded text-xs min-w-[80px]"
          >
            <option value="any">Any</option>
            <option value="today">Today</option>
            <option value="weekend">Weekend</option>
            <option value="next_weekend">Next</option>
          </select>

          {/* Distance - Compact */}
          <select
            value={distance}
            onChange={(e) => onDistanceChange(Number(e.target.value))}
            className="px-2 py-1 border rounded text-xs min-w-[60px]"
          >
            <option value={5}>5mi</option>
            <option value={10}>10mi</option>
            <option value={25}>25mi</option>
            <option value={50}>50mi</option>
            <option value={100}>100mi</option>
          </select>

          {/* More Filters Button */}
          <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
            <SheetTrigger className="flex items-center gap-1 px-2 py-1 border border-gray-300 bg-white hover:bg-gray-50 rounded text-sm">
              <Filter className="h-4 w-4" />
              {hasActiveFilters && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                {/* Date Selector */}
                <div>
                  <label className="block text-sm font-medium mb-2">Date Range</label>
                  <select
                    value={dateRange}
                    onChange={(e) => onDateRangeChange(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
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
                            inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium transition-colors
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

                {/* Distance Filter */}
                <div>
                  <label className="block text-sm font-medium mb-2">Distance</label>
                  <select
                    value={distance}
                    onChange={(e) => onDistanceChange(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value={5}>5 miles</option>
                    <option value={10}>10 miles</option>
                    <option value={25}>25 miles</option>
                    <option value={50}>50 miles</option>
                    <option value={100}>100 miles</option>
                  </select>
                </div>

                {/* Advanced Filters */}
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowMobileFilters(false)
                    onAdvancedFiltersOpen()
                  }}
                  className="w-full"
                >
                  Advanced Filters
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  )
}
