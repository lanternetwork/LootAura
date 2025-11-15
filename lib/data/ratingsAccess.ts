/**
 * Data access layer for seller ratings
 * Handles fetching and mutating seller star ratings (1-5)
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface SellerRatingSummary {
  avg_rating: number | null
  ratings_count: number
}

export interface UserRating {
  rating: number
  created_at: string
  updated_at: string
}

/**
 * Get rating summary for a seller (average rating and count)
 * This wraps owner_stats which is automatically maintained by triggers
 * @param supabase - Supabase client
 * @param sellerId - Seller user ID
 * @returns Rating summary with average and count, or null if seller not found
 */
export async function getSellerRatingSummary(
  supabase: SupabaseClient,
  sellerId: string
): Promise<SellerRatingSummary | null> {
  try {
    const { data, error } = await supabase
      .from('owner_stats')
      .select('avg_rating, ratings_count')
      .eq('user_id', sellerId)
      .maybeSingle()

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[RATINGS_ACCESS] Error fetching rating summary:', error)
      }
      return null
    }

    if (!data) {
      return null
    }

    return {
      avg_rating: data.avg_rating ? parseFloat(String(data.avg_rating)) : null,
      ratings_count: data.ratings_count ?? 0,
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[RATINGS_ACCESS] Unexpected error fetching rating summary:', error)
    }
    return null
  }
}

/**
 * Get the current user's rating for a seller
 * @param supabase - Authenticated Supabase client
 * @param sellerId - Seller user ID
 * @param raterId - Current user ID (rater)
 * @returns The user's rating (1-5) or null if not rated
 */
export async function getUserRatingForSeller(
  supabase: SupabaseClient,
  sellerId: string,
  raterId: string
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('seller_ratings')
      .select('rating')
      .eq('seller_id', sellerId)
      .eq('rater_id', raterId)
      .maybeSingle()

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[RATINGS_ACCESS] Error fetching user rating:', error)
      }
      return null
    }

    return data?.rating ?? null
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[RATINGS_ACCESS] Unexpected error fetching user rating:', error)
    }
    return null
  }
}

/**
 * Upsert a rating for a seller
 * Creates a new rating or updates existing one
 * @param supabase - Authenticated Supabase client
 * @param sellerId - Seller user ID
 * @param raterId - Current user ID (rater)
 * @param rating - Rating value (1-5)
 * @param saleId - Optional sale ID for context
 * @returns Success result with updated rating summary
 */
export async function upsertSellerRating(
  supabase: SupabaseClient,
  sellerId: string,
  raterId: string,
  rating: number,
  saleId?: string | null
): Promise<{ success: boolean; error?: string; summary?: SellerRatingSummary }> {
  // Validate rating range
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return {
      success: false,
      error: 'Rating must be an integer between 1 and 5',
    }
  }

  // Validate seller and rater are different
  if (sellerId === raterId) {
    return {
      success: false,
      error: 'Cannot rate yourself',
    }
  }

  try {
    // Upsert the rating
    const { error: upsertError } = await supabase
      .from('seller_ratings')
      .upsert(
        {
          seller_id: sellerId,
          rater_id: raterId,
          rating,
          sale_id: saleId || null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'seller_id,rater_id',
        }
      )

    if (upsertError) {
      // Check for constraint violations
      if (upsertError.code === '23505') {
        // Unique constraint violation (shouldn't happen with upsert, but handle gracefully)
        return {
          success: false,
          error: 'Rating already exists',
        }
      }
      if (upsertError.code === '23514') {
        // Check constraint violation (rating out of range or self-rating)
        if (upsertError.message?.includes('no_self_rating')) {
          return {
            success: false,
            error: 'Cannot rate yourself',
          }
        }
        return {
          success: false,
          error: 'Invalid rating value',
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        console.error('[RATINGS_ACCESS] Error upserting rating:', upsertError)
      }
      return {
        success: false,
        error: upsertError.message || 'Failed to save rating',
      }
    }

    // Fetch updated summary (triggers should have updated owner_stats, but fetch to be sure)
    // Wait a tiny bit for trigger to complete
    await new Promise((resolve) => setTimeout(resolve, 100))

    const summary = await getSellerRatingSummary(supabase, sellerId)

    if (!summary) {
      return {
        success: false,
        error: 'Failed to fetch updated rating summary',
      }
    }

    return {
      success: true,
      summary,
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[RATINGS_ACCESS] Unexpected error upserting rating:', error)
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
    }
  }
}

