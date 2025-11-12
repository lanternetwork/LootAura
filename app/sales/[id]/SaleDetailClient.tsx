'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { getSaleCoverUrl } from '@/lib/images/cover'
import SalePlaceholder from '@/components/placeholders/SalePlaceholder'
import SimpleMap from '@/components/location/SimpleMap'
import { useLocationSearch } from '@/lib/location/useLocation'
import { useAuth, useFavorites } from '@/lib/hooks/useAuth'
import { SellerActivityCard } from '@/components/sales/SellerActivityCard'
import CategoryChips from '@/components/ui/CategoryChips'
import OSMAttribution from '@/components/location/OSMAttribution'
import SaleShareButton from '@/components/share/SaleShareButton'
import type { SaleWithOwnerInfo } from '@/lib/data'
import type { SaleItem } from '@/lib/types'

interface SaleDetailClientProps {
  sale: SaleWithOwnerInfo
  displayCategories?: string[]
  items?: SaleItem[]
}

export default function SaleDetailClient({ sale, displayCategories = [], items = [] }: SaleDetailClientProps) {
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
  const { data: currentUser } = useAuth()
  const { data: favoriteSales = [] } = useFavorites()
  const [showFullDescription, setShowFullDescription] = useState(false)
  const cover = getSaleCoverUrl(sale)
  const viewTrackedRef = useRef(false)

  // Track view event when component mounts (only once)
  useEffect(() => {
    if (!viewTrackedRef.current) {
      viewTrackedRef.current = true
      // Track view event
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_id: sale.id,
          event_type: 'view',
        }),
      }).catch((error) => {
        // Silently fail - analytics tracking shouldn't break the page
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[SALE_DETAIL] Failed to track view event:', error)
        }
      })
    }
  }, [sale.id])

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


  // Keep local favorite state in sync with favorites list
  // (simple check each render; list is small)
  const fromList = Array.isArray(favoriteSales) && favoriteSales.some((s: any) => s?.id === sale.id)
  if (fromList !== isFavorited) {
    setIsFavorited(fromList)
  }

  const handleFavoriteToggle = async () => {
    try {
      if (!currentUser) {
        window.location.href = `/auth/signin?redirectTo=${encodeURIComponent(window.location.pathname)}`
        return
      }
      const response = await fetch(`/api/sales/${sale.id}/favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        // Log error details
        let errorMessage = 'Failed to save sale'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
          console.error('[SALE_DETAIL] Favorite toggle failed:', {
            status: response.status,
            error: errorData,
          })
        } catch (e) {
          console.error('[SALE_DETAIL] Favorite toggle failed:', {
            status: response.status,
            statusText: response.statusText,
          })
        }
        // Show error to user (you might want to use a toast here)
        alert(errorMessage)
        return
      }

      const result = await response.json()
      const wasFavorited = isFavorited
      setIsFavorited(result.favorited ?? !isFavorited)
      
      // Track save event if favoriting (not unfavoriting)
      if (result.favorited && !wasFavorited) {
        fetch('/api/analytics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sale_id: sale.id,
            event_type: 'save',
          }),
        }).catch((error) => {
          // Silently fail - analytics tracking shouldn't break the page
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[SALE_DETAIL] Failed to track save event:', error)
          }
        })
      }
    } catch (error) {
      console.error('[SALE_DETAIL] Failed to toggle favorite:', error)
      alert('Failed to save sale. Please try again.')
    }
  }

  // Build share URL (canonical, without UTM params)
  const shareUrl = typeof window !== 'undefined' 
    ? window.location.origin + `/sales/${sale.id}`
    : `/sales/${sale.id}`
  
  // Build share text with location and date info
  const shareTextParts: string[] = []
  if (sale.city && sale.state) {
    shareTextParts.push(`${sale.city}, ${sale.state}`)
  }
  if (sale.date_start) {
    const startDate = new Date(sale.date_start)
    if (sale.date_end && sale.date_end !== sale.date_start) {
      const endDate = new Date(sale.date_end)
      shareTextParts.push(`${startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
    } else {
      shareTextParts.push(startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
    }
  }
  const shareText = shareTextParts.length > 0 ? shareTextParts.join(' — ') : undefined

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
              
              <div className="flex gap-2 ml-4 flex-shrink-0">
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
                
                <SaleShareButton
                  url={shareUrl}
                  title={sale.title || 'Yard Sale'}
                  text={shareText}
                  saleId={sale.id}
                />
              </div>
            </div>
            </div>

            {/* Sale Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Date & Time */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Date & Time</h3>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <div className="font-medium text-gray-900">{formatDate(sale.date_start)}</div>
                      <div className="text-sm text-gray-600 mt-1">{formatTime(sale.time_start)}</div>
                    </div>
                  </div>

                  {sale.date_end && sale.time_end && (
                    <div className="flex gap-3">
                      <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <div className="font-medium text-gray-900">Ends: {formatDate(sale.date_end)}</div>
                        <div className="text-sm text-gray-600 mt-1">{formatTime(sale.time_end)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Categories */}
              {displayCategories.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Categories</h3>
                  <CategoryChips categories={displayCategories} />
                </div>
              )}
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
                    className="mt-2 link-accent font-medium"
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
            {items.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No items listed yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="relative w-full h-48 mb-3 rounded-lg overflow-hidden bg-gray-100">
                      {item.photo ? (
                        <Image
                          src={item.photo}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                          <span className="text-gray-400 text-sm">No image</span>
                        </div>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900 mb-2">{item.name}</h3>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        {item.price !== undefined ? (
                          <span className="text-lg font-semibold text-green-600">
                            ${item.price.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500 italic">Price not specified</span>
                        )}
                        {item.condition && (
                          <span className="text-sm text-gray-500">{item.condition}</span>
                        )}
                      </div>
                      {item.category && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 w-fit">
                          {item.category}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              {/* OSM Attribution - show when address exists (addresses are geocoded via Nominatim/OSM) */}
              {sale.address && (
                <div className="mt-2">
                  <OSMAttribution showGeocoding={true} />
                </div>
              )}
            </div>
          </div>

          {/* Seller Activity Card */}
          <SellerActivityCard
            ownerProfile={sale.owner_profile}
            ownerStats={sale.owner_stats}
          />

          {/* Shopping Tips */}
          <div className="bg-[rgba(147,51,234,0.08)] border border-purple-200 rounded-lg p-4">
            <h4 className="font-medium text-[#3A2268] mb-2">Shopping Tips</h4>
            <ul className="text-sm text-[#3A2268] space-y-1">
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
