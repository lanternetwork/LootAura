'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

interface SellerRatingStarsProps {
  sellerId: string
  saleId?: string | null
  currentUserRating?: number | null
  avgRating?: number | null
  ratingsCount?: number | null
  isSeller?: boolean
}

export function SellerRatingStars({
  sellerId,
  saleId,
  currentUserRating,
  avgRating,
  ratingsCount = 0,
  isSeller = false,
}: SellerRatingStarsProps) {
  const router = useRouter()
  const { data: user, isLoading: authLoading } = useAuth()
  const [hoveredRating, setHoveredRating] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localRating, setLocalRating] = useState<number | null>(currentUserRating ?? null)
  const [localSummary, setLocalSummary] = useState({
    avgRating: avgRating ?? null,
    ratingsCount: ratingsCount ?? 0,
  })

  const isAuthenticated = !!user && !authLoading
  // Determine if current user is the seller (check both prop and compare IDs)
  const isCurrentUserSeller = isSeller || (isAuthenticated && user?.id === sellerId)
  const isReadOnly = isCurrentUserSeller || !isAuthenticated
  const displayRating = hoveredRating ?? localRating ?? null
  const hasRatings = localSummary.ratingsCount > 0

  const handleStarClick = useCallback(
    async (rating: number) => {
      if (isReadOnly || isSubmitting) return

      // If not authenticated, redirect to sign in
      if (!isAuthenticated) {
        router.push(`/auth/signin?redirectTo=${encodeURIComponent(window.location.pathname)}`)
        return
      }

      setIsSubmitting(true)
      setError(null)

      try {
        const response = await fetch('/api/seller/rating', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seller_id: sellerId,
            rating,
            sale_id: saleId || null,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to save rating')
        }

        // Update local state with response
        setLocalRating(rating)
        if (data.summary) {
          setLocalSummary({
            avgRating: data.summary.avg_rating,
            ratingsCount: data.summary.ratings_count,
          })
        }

        // Refresh the page to ensure consistency
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save rating')
        if (process.env.NODE_ENV !== 'test') {
          console.error('[RATING] Error saving rating:', err)
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [sellerId, saleId, isReadOnly, isSubmitting, isAuthenticated, router]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, rating: number) => {
      if (isReadOnly || isSubmitting) return

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleStarClick(rating)
      } else if (event.key === 'ArrowRight' && rating < 5) {
        event.preventDefault()
        const nextStar = document.querySelector(
          `[data-star-rating="${rating + 1}"]`
        ) as HTMLElement
        nextStar?.focus()
      } else if (event.key === 'ArrowLeft' && rating > 1) {
        event.preventDefault()
        const prevStar = document.querySelector(
          `[data-star-rating="${rating - 1}"]`
        ) as HTMLElement
        prevStar?.focus()
      }
    },
    [isReadOnly, isSubmitting, handleStarClick]
  )

  const StarIcon = ({ filled, className }: { filled: boolean; className?: string }) => (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={filled ? 0 : 1.5}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  )

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      {/* Star Rating */}
      <div className="flex items-center gap-1" role="group" aria-label="Seller rating">
        {[1, 2, 3, 4, 5].map((rating) => {
          const isFilled = displayRating !== null && rating <= displayRating
          const isInteractive = !isReadOnly && !isSubmitting

          return (
            <button
              key={rating}
              type="button"
              data-star-rating={rating}
              onClick={() => handleStarClick(rating)}
              onMouseEnter={() => !isReadOnly && setHoveredRating(rating)}
              onMouseLeave={() => !isReadOnly && setHoveredRating(null)}
              onKeyDown={(e) => handleKeyDown(e, rating)}
              disabled={isReadOnly || isSubmitting}
              aria-label={`Rate ${rating} out of 5 stars`}
              aria-pressed={localRating === rating}
              className={`
                ${isInteractive ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                ${isSubmitting ? 'opacity-50' : ''}
                transition-transform focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-1 rounded
                ${isFilled ? 'text-amber-400' : 'text-gray-300'}
              `}
              tabIndex={isReadOnly ? -1 : 0}
            >
              <StarIcon
                filled={isFilled}
                className="w-5 h-5 sm:w-6 sm:h-6"
              />
            </button>
          )
        })}
      </div>

      {/* Rating Summary Text */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 text-sm">
        {hasRatings ? (
          <>
            <span className="font-medium text-gray-900">
              {localSummary.avgRating?.toFixed(1) ?? '0.0'}
            </span>
            <span className="text-gray-600">
              ({localSummary.ratingsCount} {localSummary.ratingsCount === 1 ? 'rating' : 'ratings'})
            </span>
            {localRating !== null && (
              <span className="text-xs text-gray-500">
                Your rating: {localRating} stars
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-500">No ratings yet</span>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-xs text-red-600 mt-1" role="alert">
          {error}
        </div>
      )}

      {/* Loading Indicator */}
      {isSubmitting && (
        <div className="text-xs text-gray-500 mt-1">Saving...</div>
      )}
    </div>
  )
}

