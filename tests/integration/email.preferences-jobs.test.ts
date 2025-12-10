/**
 * Integration tests for email job behavior vs user preferences and unsubscribe status
 * Tests that favorites digest and seller weekly analytics respect preferences/unsubscribe
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { processFavoriteSalesStartingSoonJob, processSellerWeeklyAnalyticsJob } from '@/lib/jobs/processor'
import { sendFavoriteSalesStartingSoonDigestEmail } from '@/lib/email/favorites'
import { sendSellerWeeklyAnalyticsEmail } from '@/lib/email/sellerAnalytics'

// Mock dependencies
const mockFromBase = vi.fn()
const mockAdminDb = vi.fn()
const mockAuthUsersQuery = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => mockFromBase(db, table),
}))

vi.mock('@/lib/email/favorites', () => ({
  sendFavoriteSalesStartingSoonDigestEmail: vi.fn(),
}))

vi.mock('@/lib/email/sellerAnalytics', () => ({
  sendSellerWeeklyAnalyticsEmail: vi.fn(),
}))

vi.mock('@/lib/data/profileAccess', () => ({
  getUserProfile: vi.fn().mockResolvedValue({ display_name: 'Test User' }),
}))

vi.mock('@/lib/data/sellerAnalytics', () => ({
  getSellerWeeklyAnalytics: vi.fn().mockResolvedValue({
    totalViews: 100,
    totalSaves: 20,
    totalClicks: 10,
    topSales: [],
  }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      admin: {
        listUsers: mockAuthUsersQuery,
      },
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: { display_name: 'Test User' }, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: { display_name: 'Test User' }, error: null })),
  }),
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Deterministic base date for all tests: 2025-01-15 12:00:00 UTC
const MOCK_BASE_DATE = new Date('2025-01-15T12:00:00.000Z')

describe('Email job preferences and unsubscribe behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    process.env.EMAIL_FAVORITE_SALE_STARTING_SOON_ENABLED = 'true'
    process.env.EMAIL_FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START = '24'
    process.env.EMAIL_SELLER_WEEKLY_ANALYTICS_ENABLED = 'true'
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
  })

  describe('Favorites digest respects preferences', () => {
    it('sends email to user with preferences enabled', async () => {
      const userId = 'user-a'
      const userEmail = 'user-a@example.test'
      const saleId = 'sale-1'
      
      // Create sale starting in 12 hours
      const futureDate = new Date(MOCK_BASE_DATE)
      futureDate.setHours(futureDate.getHours() + 12)
      const futureDateStr = futureDate.toISOString().split('T')[0]
      const futureTimeStr = futureDate.toISOString().split('T')[1].substring(0, 5)

      const mockSale = {
        id: saleId,
        owner_id: 'owner-1',
        title: 'Test Sale',
        address: '123 Main St',
        city: 'Test City',
        state: 'KY',
        date_start: futureDateStr,
        time_start: futureTimeStr,
        status: 'published',
        privacy_mode: 'exact',
        is_featured: false,
        created_at: MOCK_BASE_DATE.toISOString(),
        updated_at: MOCK_BASE_DATE.toISOString(),
      }

      // Mock favorites query
      mockFromBase.mockReturnValueOnce({
        select: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({
            data: [{ user_id: userId, sale_id: saleId, start_soon_notified_at: null }],
            error: null,
          })),
        })),
      })
      // Mock sales query
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [mockSale],
              error: null,
            })),
          })),
        })),
      })
      // Mock profiles query - user has preferences enabled
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [{ id: userId, email_favorites_digest_enabled: true }],
              error: null,
            })),
          })),
        })),
      })

      mockAuthUsersQuery.mockResolvedValue({
        data: { users: [{ id: userId, email: userEmail }] },
        error: null,
      })

      vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mockResolvedValue({
        ok: true,
      })

      const result = await processFavoriteSalesStartingSoonJob({})

      expect(result.success).toBe(true)
      expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledTimes(1)
      expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: userEmail,
          profileId: userId,
        })
      )
    })

    it('skips user with preferences disabled', async () => {
      const userIdEnabled = 'user-a'
      const userIdDisabled = 'user-b'
      const userEmailEnabled = 'user-a@example.test'
      const userEmailDisabled = 'user-b@example.test'
      const saleId = 'sale-1'
      
      // Create sale starting in 12 hours
      const futureDate = new Date(MOCK_BASE_DATE)
      futureDate.setHours(futureDate.getHours() + 12)
      const futureDateStr = futureDate.toISOString().split('T')[0]
      const futureTimeStr = futureDate.toISOString().split('T')[1].substring(0, 5)

      const mockSale = {
        id: saleId,
        owner_id: 'owner-1',
        title: 'Test Sale',
        address: '123 Main St',
        city: 'Test City',
        state: 'KY',
        date_start: futureDateStr,
        time_start: futureTimeStr,
        status: 'published',
        privacy_mode: 'exact',
        is_featured: false,
        created_at: MOCK_BASE_DATE.toISOString(),
        updated_at: MOCK_BASE_DATE.toISOString(),
      }

      // Mock favorites query - both users have favorites
      mockFromBase.mockReturnValueOnce({
        select: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({
            data: [
              { user_id: userIdEnabled, sale_id: saleId, start_soon_notified_at: null },
              { user_id: userIdDisabled, sale_id: saleId, start_soon_notified_at: null },
            ],
            error: null,
          })),
        })),
      })
      // Mock sales query
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [mockSale],
              error: null,
            })),
          })),
        })),
      })
      // Mock profiles query - only user-a has preferences enabled
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [{ id: userIdEnabled, email_favorites_digest_enabled: true }],
              error: null,
            })),
          })),
        })),
      })

      mockAuthUsersQuery.mockResolvedValue({
        data: {
          users: [
            { id: userIdEnabled, email: userEmailEnabled },
            { id: userIdDisabled, email: userEmailDisabled },
          ],
        },
        error: null,
      })

      vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mockResolvedValue({
        ok: true,
      })

      const result = await processFavoriteSalesStartingSoonJob({})

      expect(result.success).toBe(true)
      // Should only send to user-a (preferences enabled)
      expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledTimes(1)
      expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: userEmailEnabled,
          profileId: userIdEnabled,
        })
      )
      // Should NOT send to user-b (preferences disabled)
      expect(sendFavoriteSalesStartingSoonDigestEmail).not.toHaveBeenCalledWith(
        expect.objectContaining({
          to: userEmailDisabled,
        })
      )
    })

    it('skips unsubscribed user (preferences set to false via unsubscribe)', async () => {
      const userId = 'user-c'
      const userEmail = 'user-c@example.test'
      const saleId = 'sale-1'
      
      // Create sale starting in 12 hours
      const futureDate = new Date(MOCK_BASE_DATE)
      futureDate.setHours(futureDate.getHours() + 12)
      const futureDateStr = futureDate.toISOString().split('T')[0]
      const futureTimeStr = futureDate.toISOString().split('T')[1].substring(0, 5)

      const mockSale = {
        id: saleId,
        owner_id: 'owner-1',
        title: 'Test Sale',
        address: '123 Main St',
        city: 'Test City',
        state: 'KY',
        date_start: futureDateStr,
        time_start: futureTimeStr,
        status: 'published',
        privacy_mode: 'exact',
        is_featured: false,
        created_at: MOCK_BASE_DATE.toISOString(),
        updated_at: MOCK_BASE_DATE.toISOString(),
      }

      // Mock favorites query
      mockFromBase.mockReturnValueOnce({
        select: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({
            data: [{ user_id: userId, sale_id: saleId, start_soon_notified_at: null }],
            error: null,
          })),
        })),
      })
      // Mock sales query
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [mockSale],
              error: null,
            })),
          })),
        })),
      })
      // Mock profiles query - user has preferences disabled (unsubscribed)
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [], // User not in results because email_favorites_digest_enabled = false
              error: null,
            })),
          })),
        })),
      })

      mockAuthUsersQuery.mockResolvedValue({
        data: { users: [{ id: userId, email: userEmail }] },
        error: null,
      })

      const result = await processFavoriteSalesStartingSoonJob({})

      expect(result.success).toBe(true)
      // Should NOT send email to unsubscribed user
      expect(sendFavoriteSalesStartingSoonDigestEmail).not.toHaveBeenCalled()
    })
  })

  describe('Seller weekly analytics respects preferences', () => {
    it('sends email to seller with preferences enabled', async () => {
      const ownerId = 'owner-a'
      const ownerEmail = 'owner-a@example.test'
      
      const now = new Date(MOCK_BASE_DATE)
      const weekStart = new Date(now)
      weekStart.setUTCDate(weekStart.getUTCDate() - 7)
      weekStart.setUTCHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

      // Mock sales query
      mockFromBase.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn(() => Promise.resolve({
                data: [{ owner_id: ownerId }],
                error: null,
              })),
            })),
          })),
        })),
      })
      // Mock analytics events query
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          gte: vi.fn(() => ({
            lt: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({
                data: [],
                error: null,
              })),
            })),
          })),
        })),
      })
      // Mock profiles query - owner has preferences enabled
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [{ id: ownerId, email_seller_weekly_enabled: true }],
              error: null,
            })),
          })),
        })),
      })

      mockAuthUsersQuery.mockResolvedValue({
        data: { users: [{ id: ownerId, email: ownerEmail }] },
        error: null,
      })

      vi.mocked(sendSellerWeeklyAnalyticsEmail).mockResolvedValue({
        ok: true,
      })

      const result = await processSellerWeeklyAnalyticsJob({})

      expect(result.success).toBe(true)
      expect(sendSellerWeeklyAnalyticsEmail).toHaveBeenCalledTimes(1)
      expect(sendSellerWeeklyAnalyticsEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ownerEmail,
          profileId: ownerId,
        })
      )
    })

    it('skips seller with preferences disabled', async () => {
      const ownerIdEnabled = 'owner-a'
      const ownerIdDisabled = 'owner-b'
      const ownerEmailEnabled = 'owner-a@example.test'
      const ownerEmailDisabled = 'owner-b@example.test'
      
      const now = new Date(MOCK_BASE_DATE)
      const weekStart = new Date(now)
      weekStart.setUTCDate(weekStart.getUTCDate() - 7)
      weekStart.setUTCHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

      // Mock sales query - both owners have sales
      mockFromBase.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn(() => Promise.resolve({
                data: [
                  { owner_id: ownerIdEnabled },
                  { owner_id: ownerIdDisabled },
                ],
                error: null,
              })),
            })),
          })),
        })),
      })
      // Mock analytics events query
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          gte: vi.fn(() => ({
            lt: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({
                data: [],
                error: null,
              })),
            })),
          })),
        })),
      })
      // Mock profiles query - only owner-a has preferences enabled
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [{ id: ownerIdEnabled, email_seller_weekly_enabled: true }],
              error: null,
            })),
          })),
        })),
      })

      mockAuthUsersQuery.mockResolvedValue({
        data: {
          users: [
            { id: ownerIdEnabled, email: ownerEmailEnabled },
            { id: ownerIdDisabled, email: ownerEmailDisabled },
          ],
        },
        error: null,
      })

      vi.mocked(sendSellerWeeklyAnalyticsEmail).mockResolvedValue({
        ok: true,
      })

      const result = await processSellerWeeklyAnalyticsJob({})

      expect(result.success).toBe(true)
      // Should only send to owner-a (preferences enabled)
      expect(sendSellerWeeklyAnalyticsEmail).toHaveBeenCalledTimes(1)
      expect(sendSellerWeeklyAnalyticsEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ownerEmailEnabled,
          profileId: ownerIdEnabled,
        })
      )
      // Should NOT send to owner-b (preferences disabled)
      expect(sendSellerWeeklyAnalyticsEmail).not.toHaveBeenCalledWith(
        expect.objectContaining({
          to: ownerEmailDisabled,
        })
      )
    })

    it('skips unsubscribed seller (preferences set to false via unsubscribe)', async () => {
      const ownerId = 'owner-c'
      const ownerEmail = 'owner-c@example.test'
      
      const now = new Date(MOCK_BASE_DATE)
      const weekStart = new Date(now)
      weekStart.setUTCDate(weekStart.getUTCDate() - 7)
      weekStart.setUTCHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

      // Mock sales query
      mockFromBase.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn(() => Promise.resolve({
                data: [{ owner_id: ownerId }],
                error: null,
              })),
            })),
          })),
        })),
      })
      // Mock analytics events query
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          gte: vi.fn(() => ({
            lt: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({
                data: [],
                error: null,
              })),
            })),
          })),
        })),
      })
      // Mock profiles query - owner has preferences disabled (unsubscribed)
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [], // Owner not in results because email_seller_weekly_enabled = false
              error: null,
            })),
          })),
        })),
      })

      mockAuthUsersQuery.mockResolvedValue({
        data: { users: [{ id: ownerId, email: ownerEmail }] },
        error: null,
      })

      const result = await processSellerWeeklyAnalyticsJob({})

      expect(result.success).toBe(true)
      // Should NOT send email to unsubscribed seller
      expect(sendSellerWeeklyAnalyticsEmail).not.toHaveBeenCalled()
    })
  })
})

