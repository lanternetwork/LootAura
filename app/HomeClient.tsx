'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sale } from '@/lib/types'
import SalesMap from '@/components/location/SalesMap'
import UseLocationButton from '@/components/location/UseLocationButton'
import { useLocationSearch } from '@/lib/location/useLocation'

interface HomeClientProps {
  initialSales: Sale[]
  user: any
}

export default function HomeClient({ initialSales, user }: HomeClientProps) {
  const [sales, setSales] = useState<Sale[]>(initialSales)
  const [locationLoading] = useState(false)
  const [locationError] = useState<string | null>(null)
  const { location, searchWithLocation, setSearchRadius } = useLocationSearch()

  const handleLocationUpdate = async (newLocation: { lat: number; lng: number }) => {
    setSearchRadius(25) // Reset to default distance
    
    try {
      const results = await searchWithLocation(async ({ lat, lng, distanceKm }) => {
        const response = await fetch(`/api/sales/search?lat=${lat}&lng=${lng}&distance=${distanceKm}&limit=12`)
        if (!response.ok) throw new Error('Search failed')
        return response.json()
      })
      
      setSales(results)
    } catch (error) {
      console.error('Location search failed:', error)
    }
  }

  const handleLocationClick = () => {}

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      })
    }
  }

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  const getPriceDisplay = (price?: number) => {
    if (price === null || price === undefined) return 'Free'
    if (price === 0) return 'Free'
    return `$${price.toLocaleString()}`
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-4">
          Find Amazing Deals
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Discover yard sales, garage sales, and estate sales in your area
        </p>
        
        {/* Location Button */}
        <div className="flex justify-center">
          <UseLocationButton
            onClick={() => handleLocationUpdate(location || { lat: 38.2527, lng: -85.7585 })}
            loading={false}
            error={null}
          />
        </div>
      </div>

      {/* Compact Map Banner */}
      <div className="mb-12">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales Map</h2>
          <div className="h-64 rounded-lg overflow-hidden">
            <SalesMap
              sales={sales}
              center={location || { lat: 38.2527, lng: -85.7585 }}
              zoom={10}
            />
          </div>
        </div>
      </div>

      {/* Nearby Sales */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Nearby Sales ({sales.length})
          </h2>
          <Link
            href="/sales"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            View All Sales
          </Link>
        </div>

        {sales.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sales found</h3>
            <p className="text-gray-500">Try expanding your search radius or check back later</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sales.map((sale) => (
              <Link
                key={sale.id}
                href={`/sales/${sale.id}`}
                className="group bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 hover:border-gray-300"
              >
                <div className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                      {sale.title}
                    </h3>
                    {sale.is_featured && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 ml-2 flex-shrink-0">
                        Featured
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center">
                      <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {sale.city}, {sale.state}
                    </div>
                    
                    <div className="flex items-center">
                      <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {formatDate(sale.date_start)} at {formatTime(sale.time_start)}
                    </div>
                    
                    <div className="flex items-center">
                      <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                      </svg>
                      {getPriceDisplay(sale.price)}
                    </div>
                  </div>
                  
                  {sale.tags && sale.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {sale.tags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {tag}
                        </span>
                      ))}
                      {sale.tags.length > 3 && (
                        <span className="text-xs text-gray-500">
                          +{sale.tags.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Call to Action */}
      <div className="bg-blue-600 rounded-lg p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-4">Ready to Sell?</h2>
        <p className="text-blue-100 mb-6">
          List your yard sale and reach more buyers in your area
        </p>
        <Link
          href="/sell/new"
          className="inline-flex items-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]"
        >
          List Your Sale
        </Link>
      </div>
    </div>
  )
}
