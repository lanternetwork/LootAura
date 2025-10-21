'use client'

import { useState } from 'react'
import ZipInput from '@/components/location/ZipInput'
import DateSelector from '@/components/filters/DateSelector'
import { CategoryChips } from '@/components/filters/CategoryChips'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Filter } from 'lucide-react'

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

  return (
    <div className="p-4">
      {/* Desktop/Tablet Layout */}
      <div className="hidden md:flex items-center gap-4">
        {/* ZIP Search */}
        <div className="flex-1 max-w-xs">
          <ZipInput
            onLocationFound={onZipLocationFound}
            onError={onZipError}
            placeholder="Enter ZIP code"
            className="w-full"
          />
          {zipError && (
            <p className="text-red-500 text-sm mt-1">{zipError}</p>
          )}
        </div>

        {/* Date Selector */}
        <DateSelector
          value={{ type: dateRange as any }}
          onChange={(dateRangeObj) => onDateRangeChange(dateRangeObj.type)}
        />

        {/* Category Chips */}
        <CategoryChips
          selectedCategories={categories}
          onCategoriesChange={onCategoriesChange}
        />

        {/* Distance Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Distance:</label>
          <select
            value={distance}
            onChange={(e) => onDistanceChange(Number(e.target.value))}
            className="px-3 py-1 border rounded-md text-sm"
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
          onClick={onAdvancedFiltersOpen}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" />
          More Filters
        </Button>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        <div className="flex items-center gap-2">
          {/* ZIP Search - Compact */}
          <div className="flex-1">
            <ZipInput
              onLocationFound={onZipLocationFound}
              onError={onZipError}
              placeholder="ZIP code"
              className="w-full"
            />
            {zipError && (
              <p className="text-red-500 text-xs mt-1">{zipError}</p>
            )}
          </div>

          {/* More Filters Button */}
          <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
            <SheetTrigger>
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Filter className="h-4 w-4" />
                {hasActiveFilters && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                {/* Date Selector */}
                <div>
                  <label className="block text-sm font-medium mb-2">Date Range</label>
                  <DateSelector
                    value={{ type: dateRange as any }}
                    onChange={(dateRangeObj) => onDateRangeChange(dateRangeObj.type)}
                  />
                </div>

                {/* Category Chips */}
                <div>
                  <label className="block text-sm font-medium mb-2">Categories</label>
                  <CategoryChips
                    selectedCategories={categories}
                    onCategoriesChange={onCategoriesChange}
                  />
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
