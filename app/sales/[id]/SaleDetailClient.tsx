'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sale } from '@/lib/types'
import SalesMap from '@/components/location/SalesMap'
import { useLocationSearch } from '@/lib/location/useLocation'

interface SaleDetailClientProps {
  sale: Sale
}

export default function SaleDetailClient({ sale }: SaleDetailClientProps) {
  const { location } = useLocationSearch()
  const [isFavorited, setIsFavorited] = useState(false)
  const [showFullDescription, setShowFullDescription] = useState(false)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    })
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

  const handleFavoriteToggle = async () => {
    try {
      const response = await fetch(`/api/sales/${sale.id}/favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        setIsFavorited(!isFavorited)
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: sale.title,
          text: `Check out this yard sale: ${sale.title}`,
          url: window.location.href,
        })
      } catch (error) {
        console.error('Error sharing:', error)
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href)
    }
  }

  const currentCenter = location || { lat: sale.lat || 38.2527, lng: sale.lng || -85.7585 }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-8">
        <ol className="flex items-center space-x-2 text-sm text-gray-500">
          <li>
            <Link href="/" className="hover:text-gray-700">
              Home
            </Link>
          </li>
          <li>/</li>
          <li>
            <Link href="/sales" className="hover:text-gray-700">
              Sales
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-900 font-medium">{sale.title}</li>
        </ol>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Sale Header */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{sale.title}</h1>
                <div className="flex items-center text-gray-600 mb-4">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {sale.address && `${sale.address}, `}{sale.city}, {sale.state}
                </div>
              </div>
              
              <div className="flex gap-2 ml-4">
                <button
                  onClick={handleFavoriteToggle}
                  className={`inline-flex items-center px-4 py-2 rounded-lg font-medium transition-colors min-h-[44px] ${
                    isFavorited
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <svg className="w-5 h-5 mr-2" fill={isFavorited ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {isFavorited ? 'Saved' : 'Save'}
                </button>
                
                <button
                  onClick={handleShare}
                  className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium hover:bg-blue-200 transition-colors min-h-[44px]"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                  </svg>
                  Share
                </button>
              </div>
            </div>

            {/* Sale Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Date & Time</h3>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <div>
                        <div className="font-medium">{formatDate(sale.date_start)}</div>
                        <div className="text-sm text-gray-600">{formatTime(sale.time_start)}</div>
                      </div>
                    </div>
                    
                    {sale.date_end && sale.time_end && (
                      <div className="flex items-center">
                        <svg className="w-5 h-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <div className="font-medium">Ends: {formatDate(sale.date_end)}</div>
                          <div className="text-sm text-gray-600">{formatTime(sale.time_end)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Price</h3>
                  <div className="text-2xl font-bold text-green-600">
                    {getPriceDisplay(sale.price)}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Categories</h3>
                {sale.tags && sale.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {sale.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No categories specified</p>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {sale.description && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Description</h2>
              <div className="prose prose-gray max-w-none">
                <p className={`text-gray-700 ${!showFullDescription && 'line-clamp-3'}`}>
                  {sale.description}
                </p>
                {sale.description.length > 200 && (
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="mt-2 text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {showFullDescription ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Items Grid */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Items for Sale</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Mock items - in real app, these would come from the database */}
              {[
                { name: 'Vintage Coffee Table', price: 50, condition: 'Good' },
                { name: 'Dining Room Chairs (Set of 4)', price: 80, condition: 'Excellent' },
                { name: 'Bookshelf', price: 25, condition: 'Fair' },
                { name: 'Kitchen Appliances', price: 120, condition: 'Good' },
                { name: 'Children\'s Toys', price: 30, condition: 'Good' },
                { name: 'Garden Tools', price: 40, condition: 'Excellent' },
              ].map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">{item.name}</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-green-600">
                      ${item.price}
                    </span>
                    <span className="text-sm text-gray-500">{item.condition}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Map */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Location</h3>
            <div className="h-64 rounded-lg overflow-hidden">
              <SalesMap
                sales={[sale]}
                center={currentCenter}
                zoom={15}
              />
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>{sale.address}</p>
              <p>{sale.city}, {sale.state} {sale.zip_code}</p>
            </div>
          </div>

          {/* Seller Card */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Seller</h3>
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-gray-900">John Doe</div>
                <div className="text-sm text-gray-500">Verified Seller</div>
              </div>
            </div>
            
            <div className="mt-4 space-y-2">
              <button className="w-full inline-flex items-center justify-center px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contact Seller
              </button>
              
              <button className="w-full inline-flex items-center justify-center px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors min-h-[44px]">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call Seller
              </button>
            </div>
          </div>

          {/* Safety Tips */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">Safety Tips</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Meet in a public place</li>
              <li>• Bring a friend if possible</li>
              <li>• Trust your instincts</li>
              <li>• Verify items before purchasing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
