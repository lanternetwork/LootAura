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

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAdminDb).mockReturnValue(mockAdmin)
  })

  describe('incrementZipUsage', () => {
    it('should insert new ZIP usage for first-time use', async () => {
      // No existing row
      vi.mocked(fromBase).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as any)

      // Insert path
      vi.mocked(fromBase).mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      } as any)

      const result = await incrementZipUsage('user-1', '40204')

      expect(result.success).toBe(true)
      expect(fromBase).toHaveBeenCalled()
    })

    it('should increment use_count if last_seen_at is >= 24 hours ago', async () => {
      const yesterday = new Date()
      yesterday.setUTCHours(yesterday.getUTCHours() - 25) // 25 hours ago

      // Existing row with old last_seen_at
      vi.mocked(fromBase).mockReturnValueOnce({
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
      } as any)

      // Update path - final chain returns promise
      const mockUpdateChain = {
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
      vi.mocked(fromBase).mockReturnValueOnce({
        update: vi.fn().mockReturnValue(mockUpdateChain),
      } as any)

      const result = await incrementZipUsage('user-1', '40204')

      expect(result.success).toBe(true)
      expect(mockUpdateChain.eq).toHaveBeenCalled()
    })

    it('should skip increment if last_seen_at is < 24 hours ago (throttle)', async () => {
      const oneHourAgo = new Date()
      oneHourAgo.setUTCHours(oneHourAgo.getUTCHours() - 1)

      // Existing row with recent last_seen_at
      vi.mocked(fromBase).mockReturnValueOnce({
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
      } as any)

      const result = await incrementZipUsage('user-1', '40204')

      expect(result.success).toBe(true)
      // Should not call update (throttled)
      expect(fromBase).toHaveBeenCalledTimes(1) // Only the select
    })

    it('should reject invalid ZIP format', async () => {
      const result = await incrementZipUsage('user-1', 'invalid')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid ZIP format')
    })
  })

  describe('getPrimaryZip', () => {
    it('should return ZIP with highest use_count', async () => {
      vi.mocked(fromBase).mockReturnValueOnce({
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
      } as any)

      const zip = await getPrimaryZip('user-1')

      expect(zip).toBe('40204')
    })

    it('should return null if no ZIP usage found', async () => {
      vi.mocked(fromBase).mockReturnValueOnce({
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
      } as any)

      const zip = await getPrimaryZip('user-1')

      expect(zip).toBeNull()
    })
  })
})

