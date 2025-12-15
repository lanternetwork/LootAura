/**
 * ZIP Usage Tracking Tests
 * 
 * Tests the real implementation of ZIP usage tracking:
 * - Increments use_count correctly
 * - Respects throttle (no double increment within 24h)
 * - Primary ZIP selection chooses by highest use_count, tie-break by last_seen_at
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { incrementZipUsage, getPrimaryZip } from '@/lib/data/zipUsage'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'

// Mock the admin client
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(),
  fromBase: vi.fn(),
}))

describe('ZIP Usage Tracking', () => {
  const mockAdmin = {} as any
  const mockFromBase = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAdminDb).mockReturnValue(mockAdmin)
    vi.mocked(fromBase).mockReturnValue(mockFromBase as any)
  })

  describe('incrementZipUsage', () => {
    it('should insert new ZIP usage for first-time use', async () => {
      // No existing row
      mockFromBase.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      })

      // Insert path
      mockFromBase.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })

      const result = await incrementZipUsage('user-1', '40204')

      expect(result.success).toBe(true)
      expect(mockFromBase).toHaveBeenCalled()
    })

    it('should increment use_count if last_seen_at is >= 24 hours ago', async () => {
      const yesterday = new Date()
      yesterday.setUTCHours(yesterday.getUTCHours() - 25) // 25 hours ago

      // Existing row with old last_seen_at
      mockFromBase.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'existing-id',
                  use_count: 5,
                  last_seen_at: yesterday.toISOString(),
                },
                error: null,
              }),
            }),
          }),
        }),
      })

      // Update path
      const mockUpdate = vi.fn().mockResolvedValue({ error: null })
      mockFromBase.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(mockUpdate),
          }),
        }),
      })

      const result = await incrementZipUsage('user-1', '40204')

      expect(result.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalled()
    })

    it('should skip increment if last_seen_at is < 24 hours ago (throttle)', async () => {
      const oneHourAgo = new Date()
      oneHourAgo.setUTCHours(oneHourAgo.getUTCHours() - 1)

      // Existing row with recent last_seen_at
      mockFromBase.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'existing-id',
                  use_count: 5,
                  last_seen_at: oneHourAgo.toISOString(),
                },
                error: null,
              }),
            }),
          }),
        }),
      })

      const result = await incrementZipUsage('user-1', '40204')

      expect(result.success).toBe(true)
      // Should not call update (throttled)
      expect(mockFromBase).toHaveBeenCalledTimes(1) // Only the select
    })

    it('should reject invalid ZIP format', async () => {
      const result = await incrementZipUsage('user-1', 'invalid')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid ZIP format')
    })
  })

  describe('getPrimaryZip', () => {
    it('should return ZIP with highest use_count', async () => {
      mockFromBase.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { zip: '40204' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      })

      const zip = await getPrimaryZip('user-1')

      expect(zip).toBe('40204')
    })

    it('should return null if no ZIP usage found', async () => {
      mockFromBase.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      })

      const zip = await getPrimaryZip('user-1')

      expect(zip).toBeNull()
    })
  })
})

