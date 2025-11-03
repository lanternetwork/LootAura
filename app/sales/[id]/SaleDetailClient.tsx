'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { getSaleCoverUrl } from '@/lib/images/cover'
import SalePlaceholder from '@/components/placeholders/SalePlaceholder'
import SimpleMap from '@/components/location/SimpleMap'
import { useLocationSearch } from '@/lib/location/useLocation'
import { SellerActivityCard } from '@/components/sales/SellerActivityCard'
import type { SaleWithOwnerInfo } from '@/lib/data'

interface SaleDetailClientProps {
  sale: SaleWithOwnerInfo
}

export default function SaleDetailClient({ sale }: SaleDetailClientProps) {
  const searchParams = useSearchParams()
  
  // Get viewport params from URL to preserve on back navigation
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const zoom = searchParams.get('zoom')
  
  // Build back link with viewport params if they exist
  const backUrl = lat && lng && zoom
    ? `/sales?lat=${lat}&lng=${lng}&zoom=${zoom}`
    : '/sales'
  const { location } = useLocationSearch()
  const [isFavorited, setIsFavorited] = useState(false)
  const [showFullDescription, setShowFullDescription] = useState(false)
  const cover = getSaleCoverUrl(sale)

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
            <Link href={backUrl} className="hover:text-gray-700">
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
          <div className="bg-white rounded-lg shadow-sm">
            <div className="relative w-full overflow-hidden rounded-t-lg bg-gray-100 aspect-[16/9] md:aspect-[4/3]">
              {cover ? (
                <Image src={cover.url} alt={cover.alt} fill className="object-cover" sizes="(min-width:1024px) 66vw, 100vw" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-8 md:p-10">
                  <SalePlaceholder className="max-w-[88%] max-h-[88%] w-auto h-auto opacity-90 scale-[1.3]" />
                </div>
              )}
            </div>
            <div className="p-6">
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
            </div>

            {/* Sale Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column intentionally blank while we verify card spacing */}
              <div />

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
              <SimpleMap
                center={currentCenter}
                zoom={15}
                pins={{
                  sales: (typeof sale.lat === 'number' && typeof sale.lng === 'number') ? [{ id: sale.id, lat: sale.lat!, lng: sale.lng! }] : [],
                  selectedId: sale.id,
                  onPinClick: () => {},
                  onClusterClick: () => {}
                }}
              />
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>{sale.address}</p>
              <p>{sale.city}, {sale.state} {sale.zip_code}</p>
            </div>
          </div>

          {/* Seller Activity Card */}
          <SellerActivityCard
            ownerProfile={sale.owner_profile}
            ownerStats={sale.owner_stats}
          />

          {/* Shopping Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Shopping Tips</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Bring cash — many sales are cash only</li>
              <li>• Arrive early for the best selection</li>
              <li>• Check items before purchasing</li>
              {sale.pricing_mode === 'firm' ? (
                <li>• Prices are as marked</li>
              ) : sale.pricing_mode === 'best_offer' ? (
                <li>• Make your best offer — seller is accepting offers</li>
              ) : sale.pricing_mode === 'ask' ? (
                <li>• Ask seller about pricing</li>
              ) : (
                <li>• Negotiate politely — prices may be flexible</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
