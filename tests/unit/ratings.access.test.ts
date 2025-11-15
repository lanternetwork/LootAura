import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getSellerRatingSummary,
  getUserRatingForSeller,
  upsertSellerRating,
} from '@/lib/data/ratingsAccess'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('ratingsAccess', () => {
  let mockSupabase: SupabaseClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = {
      from: vi.fn(),
    } as any
  })

  describe('getSellerRatingSummary', () => {
    it('returns rating summary from owner_stats', async () => {
      const mockData = {
        avg_rating: 4.5,
        ratings_count: 10,
      }

      ;(mockSupabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: mockData,
              error: null,
            }),
          }),
        }),
      })

      const result = await getSellerRatingSummary(mockSupabase, 'seller-123')

      expect(result).toEqual({
        avg_rating: 4.5,
        ratings_count: 10,
      })
    })

    it('returns null when seller not found', async () => {
      ;(mockSupabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      })

      const result = await getSellerRatingSummary(mockSupabase, 'seller-123')

      expect(result).toBeNull()
    })

    it('handles null avg_rating', async () => {
      const mockData = {
        avg_rating: null,
        ratings_count: 0,
      }

      ;(mockSupabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: mockData,
              error: null,
            }),
          }),
        }),
      })

      const result = await getSellerRatingSummary(mockSupabase, 'seller-123')

      expect(result).toEqual({
        avg_rating: null,
        ratings_count: 0,
      })
    })
  })

  describe('getUserRatingForSeller', () => {
    it('returns user rating when exists', async () => {
      const mockData = {
        rating: 5,
      }

      ;(mockSupabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockData,
                error: null,
              }),
            }),
          }),
        }),
      })

      const result = await getUserRatingForSeller(
        mockSupabase,
        'seller-123',
        'rater-456'
      )

      expect(result).toBe(5)
    })

    it('returns null when rating does not exist', async () => {
      ;(mockSupabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      })

      const result = await getUserRatingForSeller(
        mockSupabase,
        'seller-123',
        'rater-456'
      )

      expect(result).toBeNull()
    })
  })

  describe('upsertSellerRating', () => {
    it('creates new rating successfully', async () => {
      // Mock upsert
      ;(mockSupabase.from as any).mockReturnValue({
        upsert: vi.fn().mockResolvedValue({
          error: null,
        }),
      })

      // Mock getSellerRatingSummary (called after upsert)
      const mockSummary = { avg_rating: 4.0, ratings_count: 1 }
      const ratingsAccess = await import('@/lib/data/ratingsAccess')
      vi.spyOn(ratingsAccess, 'getSellerRatingSummary').mockResolvedValue(mockSummary)

      const result = await upsertSellerRating(
        mockSupabase,
        'seller-123',
        'rater-456',
        4,
        null
      )

      expect(result.success).toBe(true)
      expect(result.summary).toEqual(mockSummary)
    })

    it('updates existing rating successfully', async () => {
      // Mock upsert
      ;(mockSupabase.from as any).mockReturnValue({
        upsert: vi.fn().mockResolvedValue({
          error: null,
        }),
      })

      // Mock getSellerRatingSummary
      const mockSummary = { avg_rating: 5.0, ratings_count: 1 }
      const ratingsAccess = await import('@/lib/data/ratingsAccess')
      vi.spyOn(ratingsAccess, 'getSellerRatingSummary').mockResolvedValue(mockSummary)

      const result = await upsertSellerRating(
        mockSupabase,
        'seller-123',
        'rater-456',
        5,
        'sale-789'
      )

      expect(result.success).toBe(true)
      expect(result.summary).toEqual(mockSummary)
    })

    it('rejects invalid rating values', async () => {
      const result = await upsertSellerRating(
        mockSupabase,
        'seller-123',
        'rater-456',
        6, // Invalid: > 5
        null
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('between 1 and 5')
    })

    it('rejects self-rating', async () => {
      const result = await upsertSellerRating(
        mockSupabase,
        'seller-123',
        'seller-123', // Same as seller_id
        5,
        null
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot rate yourself')
    })

    it('handles database constraint violations', async () => {
      ;(mockSupabase.from as any).mockReturnValue({
        upsert: vi.fn().mockResolvedValue({
          error: {
            code: '23514',
            message: 'check constraint violation',
          },
        }),
      })

      const result = await upsertSellerRating(
        mockSupabase,
        'seller-123',
        'rater-456',
        5,
        null
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

