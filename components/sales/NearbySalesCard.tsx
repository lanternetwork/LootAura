'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'
import { formatDistance } from '@/lib/utils/distance'
import SalePlaceholder from '@/components/placeholders/SalePlaceholder'
import AddressLink from '@/components/common/AddressLink'
import { trackAnalyticsEvent } from '@/lib/analytics-client'

interface NearbySalesCardProps {
  nearbySales: Array<Sale & { distance_m: number }>
}

export function NearbySalesCard({ nearbySales }: NearbySalesCardProps) {
  // Don't render if no nearby sales
  if (!nearbySales || nearbySales.length === 0) {
    return null
  }

  const formatDate = (dateString: string, timeString?: string, endDateString?: string): string => {
    try {
      const date = new Date(`${dateString}T${timeString || '00:00'}`)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const saleDate = new Date(date)
      saleDate.setHours(0, 0, 0, 0)
      
      // Multi-day sale: show date range with start time
      if (endDateString && endDateString !== dateString) {
        const startFormatted = date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const endDate = new Date(endDateString)
        const endFormatted = endDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        if (timeString) {
          const [hours, minutes] = timeString.split(':')
          const hour = parseInt(hours, 10)
          const ampm = hour >= 12 ? 'PM' : 'AM'
          const displayHour = hour % 12 || 12
          return `${startFormatted} – ${endFormatted} • ${displayHour}:${minutes} ${ampm}`
        }
        return `${startFormatted} – ${endFormatted}`
      }
      
      // Check if it's today
      if (saleDate.getTime() === today.getTime()) {
        if (timeString) {
          const [hours, minutes] = timeString.split(':')
          const hour = parseInt(hours, 10)
          const ampm = hour >= 12 ? 'PM' : 'AM'
          const displayHour = hour % 12 || 12
          return `Today, ${displayHour}:${minutes} ${ampm}`
        }
        return 'Today'
      }
      
      // Check if it's tomorrow
      if (saleDate.getTime() === tomorrow.getTime()) {
        if (timeString) {
          const [hours, minutes] = timeString.split(':')
          const hour = parseInt(hours, 10)
          const ampm = hour >= 12 ? 'PM' : 'AM'
          const displayHour = hour % 12 || 12
          return `Tomorrow, ${displayHour}:${minutes} ${ampm}`
        }
        return 'Tomorrow'
      }
      
      // Format as "Sat, Nov 16" with time if available
      const dateFormatted = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      if (timeString) {
        const [hours, minutes] = timeString.split(':')
        const hour = parseInt(hours, 10)
        const ampm = hour >= 12 ? 'PM' : 'AM'
        const displayHour = hour % 12 || 12
        return `${dateFormatted} • ${displayHour}:${minutes} ${ampm}`
      }
      return dateFormatted
    } catch {
      // Fallback to simple date string if parsing fails
      return dateString
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 lg:p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Nearby Sales</h3>
      <div className="space-y-4">
        {nearbySales.map((nearbySale) => {
          const cover = getSaleCoverUrl(nearbySale)
          const distanceText = formatDistance(nearbySale.distance_m, 'miles')
          const dateText = nearbySale.date_start 
            ? formatDate(nearbySale.date_start, nearbySale.time_start, nearbySale.date_end) || 'Date TBD'
            : 'Date TBD'
          const locationText = nearbySale.city && nearbySale.state 
            ? `${nearbySale.city}, ${nearbySale.state}`
            : nearbySale.city || nearbySale.state || ''

          return (
            <Link
              key={nearbySale.id}
              href={`/sales/${nearbySale.id}`}
              className="block group hover:bg-gray-50 rounded-lg p-3 transition-colors"
              onClick={() => {
                trackAnalyticsEvent({
                  sale_id: nearbySale.id,
                  event_type: 'click',
                })
              }}
            >
              <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  {cover ? (
                    <Image
                      src={cover.url}
                      alt={nearbySale.title}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                      <SalePlaceholder className="w-12 h-12 opacity-60" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 group-hover:text-[var(--accent-primary)] transition-colors line-clamp-2 mb-1">
                    {nearbySale.title}
                  </h4>
                  <div className="text-sm text-gray-600 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="min-w-0">{distanceText} away</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="min-w-0 break-words">{dateText}</span>
                    </div>
                    {locationText && (
                      <div className="text-xs text-gray-500 truncate">
                        <AddressLink
                          lat={nearbySale.lat ?? undefined}
                          lng={nearbySale.lng ?? undefined}
                          address={locationText}
                        >
                          {locationText}
                        </AddressLink>
                      </div>
                    )}
                  </div>
                </div>

                {/* Arrow indicator */}
                <div className="flex items-center flex-shrink-0">
                  <svg 
                    className="w-5 h-5 text-gray-400 group-hover:text-[var(--accent-primary)] transition-colors" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

