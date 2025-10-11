'use client'
import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'

interface Review {
  id: string
  rating: number
  comment: string
  created_at: string
  user_id: string
}

interface ReviewsSectionProps {
  saleId: string
  averageRating?: number
  totalReviews?: number
}

export default function ReviewsSection({ saleId, averageRating = 0, totalReviews = 0 }: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [userReview, setUserReview] = useState<Review | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const { data: user } = useAuth()
  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    fetchReviews()
    if (user) {
      fetchUserReview()
    }
  }, [saleId, user])

  const fetchReviews = async () => {
    try {
      // First get the sale to compute the review_key
      const { data: sale, error: saleError } = await supabase
        .from('sales_v2')
        .select('address_key, owner_id')
        .eq('id', saleId)
        .single()

      if (saleError) throw saleError

      // Compute review_key from address_key + owner_id
      const reviewKey = `${sale.address_key}|${sale.owner_id}`

      // Fetch reviews by review_key (dual-link system)
      const { data, error } = await supabase
        .from('reviews_v2')
        .select('*')
        .eq('review_key', reviewKey)
        .order('created_at', { ascending: false })

      if (error) throw error
      setReviews(data || [])
    } catch (error) {
      console.error('Error fetching reviews:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchUserReview = async () => {
    if (!user) return

    try {
      // First get the sale to compute the review_key
      const { data: sale, error: saleError } = await supabase
        .from('sales_v2')
        .select('address_key, owner_id')
        .eq('id', saleId)
        .single()

      if (saleError) throw saleError

      // Compute review_key from address_key + owner_id
      const reviewKey = `${sale.address_key}|${sale.owner_id}`

      // Fetch user's review by review_key and user_id
      const { data, error } = await supabase
        .from('reviews_v2')
        .select('*')
        .eq('review_key', reviewKey)
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      setUserReview(data)
      
      if (data) {
        setRating(data.rating)
        setComment(data.comment || '')
      }
    } catch (error) {
      console.error('Error fetching user review:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || rating === 0) return

    setIsSubmitting(true)

    try {
      const reviewData = {
        sale_id: saleId,
        user_id: user.id,
        rating,
        comment: comment.trim() || null
      }

      if (userReview) {
        // Update existing review
        const { error } = await supabase
          .from('reviews_v2')
          .update(reviewData)
          .eq('id', userReview.id)

        if (error) throw error
      } else {
        // Create new review (server will compute review_key via trigger)
        const { error } = await supabase
          .from('reviews_v2')
          .insert([reviewData])

        if (error) throw error
      }

      // Refresh reviews
      await fetchReviews()
      await fetchUserReview()
      
      // Reset form
      if (!userReview) {
        setRating(0)
        setComment('')
      }
    } catch (error) {
      console.error('Error submitting review:', error)
      alert('Failed to submit review. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStars = (rating: number, interactive = false, onRatingChange?: (rating: number) => void) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type={interactive ? 'button' : undefined}
            onClick={interactive && onRatingChange ? () => onRatingChange(star) : undefined}
            className={`text-2xl ${
              star <= rating
                ? 'text-amber-400'
                : 'text-neutral-300'
            } ${interactive ? 'hover:text-amber-300 cursor-pointer' : ''}`}
            disabled={!interactive}
          >
            ★
          </button>
        ))}
      </div>
    )
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading reviews...</div>
  }

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      <div className="border-b pb-4">
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold">{averageRating.toFixed(1)}</div>
          <div>
            {renderStars(Math.round(averageRating))}
            <div className="text-sm text-neutral-600 mt-1">
              {totalReviews} review{totalReviews !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Review Form */}
      {user && (
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">
            {userReview ? 'Update Your Review' : 'Write a Review'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Rating</label>
              {renderStars(rating, true, setRating)}
            </div>
            <div>
              <label htmlFor="comment" className="block text-sm font-medium mb-2">
                Comment (optional)
              </label>
              <textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full p-3 border rounded-lg resize-none"
                rows={3}
                placeholder="Share your experience with this sale..."
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || rating === 0}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : userReview ? 'Update Review' : 'Submit Review'}
            </button>
          </form>
        </div>
      )}

      {/* Reviews List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Reviews</h3>
        {reviews.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            No reviews yet. Be the first to review this sale!
          </div>
        ) : (
          reviews.map((review) => (
            <div key={review.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                {renderStars(review.rating)}
                <div className="text-sm text-neutral-500">
                  {new Date(review.created_at).toLocaleDateString()}
                </div>
              </div>
              {review.comment && (
                <p className="text-neutral-700">{review.comment}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
