'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sale } from '@/lib/types'
import { GetSalesParams, formatDistance } from '@/lib/data/sales'
import SalesMap from '@/components/location/SalesMap'
import UseLocationButton from '@/components/location/UseLocationButton'
import ZipInput from '@/components/location/ZipInput'
import { useLocation } from '@/lib/location/useLocation'
import SaleCard from '@/components/SaleCard'
import FiltersModal from '@/components/filters/FiltersModal'
import FilterTrigger from '@/components/filters/FilterTrigger'
import DateWindowLabel from '@/components/filters/DateWindowLabel'
import DegradedBanner from '@/components/DegradedBanner'
import { useFilters } from '@/lib/hooks/useFilters'
import { User } from '@supabase/supabase-js'

// Cookie utility functions
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

interface SalesClientProps {
  initialSales: Sale[]
  initialSearchParams: {
    lat?: string
    lng?: string
    distanceKm?: string
    city?: string
    categories?: string
    dateFrom?: string
    dateTo?: string
    page?: string
    pageSize?: string
  }
  user: User | null
}

export default function SalesClient({ initialSales, initialSearchParams, user }: SalesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { location, getLocation, loading: locationLoading, error: locationError } = useLocation()
  const { filters, updateFilters, hasActiveFilters } = useFilters()

  const [sales, setSales] = useState<Sale[]>(initialSales)
  const [loading, setLoading] = useState(false)
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [dateWindow, setDateWindow] = useState<any>(null)
  const [degraded, setDegraded] = useState(false)

  const fetchSales = useCallback(async () => {
    setLoading(true)
    console.log(`[SALES] fetchSales called with location: ${filters.lat}, ${filters.lng}`)
    
    // If no location, don't try to fetch sales yet
    if (!filters.lat || !filters.lng) {
      console.log('[SALES] No location provided, waiting for location')
      setSales([])
      setDateWindow(null)
      setDegraded(false)
      setLoading(false)
      return
    }

    const params: GetSalesParams = {
      lat: filters.lat,
      lng: filters.lng,
      distanceKm: (filters.distance || 25) * 1.60934, // Convert miles to km
      city: filters.city,
      categories: filters.categories.length > 0 ? filters.categories : undefined,
      dateRange: filters.dateRange !== 'any' ? filters.dateRange : undefined,
      limit: 50,
      offset: 0,
    }

    const queryString = new URLSearchParams(
      Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            acc[key] = value.join(',')
          } else {
            acc[key] = String(value)
          }
        }
        return acc
      }, {} as Record<string, string>)
    ).toString()

    try {
      console.log(`[SALES] Fetching from: /api/sales?${queryString}`)
      const res = await fetch(`/api/sales?${queryString}`)
      const data = await res.json()
      console.log(`[SALES] API response:`, data)
      
      if (data.ok) {
        setSales(data.data || [])
        setDateWindow(data.dateWindow || null)
        setDegraded(data.degraded || false)
        console.log(`[SALES] Set ${data.data?.length || 0} sales`)
      } else {
        console.error('Sales API error:', data.error)
        setSales([])
        setDateWindow(null)
        setDegraded(false)
      }
    } catch (error) {
      console.error('Error fetching sales:', error)
      setSales([])
    } finally {
      setLoading(false)
    }
  }, [filters.lat, filters.lng, filters.distance, filters.city, filters.categories, filters.dateRange])

  useEffect(() => {
    fetchSales()
  }, [fetchSales])

  // Don't automatically request location - let user choose

  useEffect(() => {
    if (location && location.lat && location.lng) {
      console.log('[SALES] Location found, updating filters')
      updateFilters({
        lat: location.lat,
        lng: location.lng
      })
    }
  }, [location, updateFilters])

  // Initialize location from cookie on mount
  useEffect(() => {
    const cookieData = getCookie('la_loc')
    if (cookieData && !filters.lat && !filters.lng) {
      try {
        const locationData = JSON.parse(cookieData)
        if (locationData.lat && locationData.lng) {
          console.log(`[SALES] Loading location from cookie: ${locationData.zip} (${locationData.city}, ${locationData.state})`)
          updateFilters({
            lat: locationData.lat,
            lng: locationData.lng,
            city: locationData.city
          })
        }
      } catch (error) {
        console.error('Failed to parse location cookie:', error)
      }
    }
  }, []) // Only run on mount

  const handleLocationClick = () => {
    getLocation()
  }

  const handleZipLocationFound = (lat: number, lng: number, city?: string, state?: string, zip?: string) => {
    setZipError(null)
    console.log(`[ZIP] Setting new location: ${lat}, ${lng} (${city}, ${state})`)
    
    updateFilters({
      lat,
      lng,
      city: city || undefined
    })
    
    // Update URL with new location and ZIP
    const params = new URLSearchParams(searchParams.toString())
    params.set('lat', lat.toString())
    params.set('lng', lng.toString())
    if (city) params.set('city', city)
    if (state) params.set('state', state)
    if (zip) params.set('zip', zip)
    
    const newUrl = `${window.location.pathname}?${params.toString()}`
    router.push(newUrl)
    
    // Force a manual fetch to ensure it happens
    console.log(`[ZIP] Manually triggering fetchSales after ZIP lookup`)
    setTimeout(() => {
      fetchSales()
    }, 100)
  }

  const handleZipError = (error: string) => {
    setZipError(error)
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <div className="lg:w-2/3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Sales Search</h1>
              {dateWindow && (
                <DateWindowLabel dateWindow={dateWindow} className="mb-4" />
              )}
              {degraded && (
                <DegradedBanner className="mb-4" />
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  {/* ZIP Input */}
                  <div className="flex-1 sm:flex-none">
                    <div className="text-xs text-gray-500 mb-1">Search different area:</div>
                    <ZipInput
                      onLocationFound={handleZipLocationFound}
                      onError={handleZipError}
                      placeholder="Enter ZIP code"
                      className="w-full sm:w-auto"
                    />
                    {zipError && (
                      <p className="text-red-500 text-sm mt-1">{zipError}</p>
                    )}
                  </div>
              
              {/* Location Button */}
              <UseLocationButton 
                onClick={handleLocationClick} 
                loading={locationLoading} 
                error={locationError?.message || null} 
              />
              
              {/* Mobile Filter Trigger */}
              <FilterTrigger
                isOpen={showFiltersModal}
                onToggle={() => setShowFiltersModal(!showFiltersModal)}
                activeFiltersCount={hasActiveFilters ? 1 : 0}
                className="sm:hidden"
              />
            </div>
          </div>

          {/* Sales Grid */}
          <div className="mb-6">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2">Loading sales...</span>
              </div>
            ) : (!filters.lat || !filters.lng) ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📍</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Getting Your Location</h3>
                <p className="text-gray-500 mb-4">We're finding yard sales near you...</p>
                <div className="flex justify-center">
                  <UseLocationButton 
                    onClick={handleLocationClick} 
                    loading={locationLoading} 
                    error={locationError?.message || null} 
                  />
                </div>
              </div>
            ) : sales.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No sales found matching your criteria.</p>
                <p className="text-gray-400 mt-2">Try adjusting your filters or location.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="sales-grid">
                {sales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Filters Sidebar */}
        <div className="hidden lg:block lg:w-1/3">
          <div className="sticky top-4 space-y-6">
            {/* Filters */}
            <FiltersModal isOpen={true} onClose={() => {}} />
            
            {/* Map */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-xl font-semibold mb-4">Map View</h2>
              <div className="h-[400px] rounded-lg overflow-hidden">
                <SalesMap
                  sales={sales}
                  center={filters.lat && filters.lng ? { lat: filters.lat, lng: filters.lng } : { lat: 38.2527, lng: -85.7585 }}
                  zoom={filters.lat && filters.lng ? 12 : 10}
                />
                {/* Debug info */}
                {filters.lat && filters.lng && (
                  <div className="mt-2 text-xs text-gray-500">
                    Center: {filters.lat.toFixed(4)}, {filters.lng.toFixed(4)} | Sales: {sales.length}
                  </div>
                )}
              </div>
              
              {/* Location Info */}
              {filters.lat && filters.lng && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Searching within {filters.distance} miles</strong> of your location
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Found {sales.length} sales
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Filters Modal */}
      <FiltersModal 
        isOpen={showFiltersModal} 
        onClose={() => setShowFiltersModal(false)} 
      />
    </div>
  )
}