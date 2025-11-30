import { describe, it, expect, beforeEach, vi } from 'vitest'
import { processSellerWeeklyAnalyticsJob } from '@/lib/jobs/processor'
import { sendSellerWeeklyAnalyticsEmail } from '@/lib/email/sellerAnalytics'
import { getSellerWeeklyAnalytics } from '@/lib/data/sellerAnalytics'

// Mock dependencies
const mockFromBase = vi.fn()
const mockAdminDb = vi.fn()
const mockAuthUsersQuery = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => mockFromBase(db, table),
}))

vi.mock('@/lib/email/sellerAnalytics', () => ({
  sendSellerWeeklyAnalyticsEmail: vi.fn(),
}))

vi.mock('@/lib/data/sellerAnalytics', () => ({
  getSellerWeeklyAnalytics: vi.fn(),
}))

vi.mock('@/lib/data/profileAccess', () => ({
  getUserProfile: vi.fn().mockResolvedValue({ display_name: 'Test Seller' }),
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
          maybeSingle: vi.fn(() => Promise.resolve({ data: { display_name: 'Test Seller' }, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: { display_name: 'Test Seller' }, error: null })),
  }),
}))

describe('processSellerWeeklyAnalyticsJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    process.env.EMAIL_SELLER_WEEKLY_ANALYTICS_ENABLED = 'true'
    mockAuthUsersQuery.mockResolvedValue({
      data: { users: [{ id: 'owner-1', email: 'seller@example.com' }] },
      error: null,
    })
  })

  it('should return success when feature is disabled', async () => {
    process.env.EMAIL_SELLER_WEEKLY_ANALYTICS_ENABLED = 'false'
    const result = await processSellerWeeklyAnalyticsJob({})

    expect(result.success).toBe(true)
    expect(sendSellerWeeklyAnalyticsEmail).not.toHaveBeenCalled()
  })

  it('should return success when no eligible owners are found', async () => {
    // Mock empty sales query
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            lt: vi.fn(() => Promise.resolve({
              data: [],
              error: null,
            })),
          })),
        })),
      })),
    }).mockReturnValueOnce({
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

    const result = await processSellerWeeklyAnalyticsJob({})

    expect(result.success).toBe(true)
    expect(sendSellerWeeklyAnalyticsEmail).not.toHaveBeenCalled()
  })

  it('should send emails for eligible owners with metrics', async () => {
    const now = new Date()
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
              data: [{ owner_id: 'owner-1' }],
              error: null,
            })),
          })),
        })),
      })),
    }).mockReturnValueOnce({
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

    // Mock metrics
    vi.mocked(getSellerWeeklyAnalytics).mockResolvedValue({
      totalViews: 100,
      totalSaves: 20,
      totalClicks: 10,
      topSales: [
        {
          saleId: 'sale-1',
          saleTitle: 'Test Sale',
          views: 100,
          saves: 20,
          clicks: 10,
          ctr: 10.0,
        },
      ],
    })

    // Mock successful email send
    vi.mocked(sendSellerWeeklyAnalyticsEmail).mockResolvedValue({ ok: true })

    const result = await processSellerWeeklyAnalyticsJob({})

    expect(result.success).toBe(true)
    expect(sendSellerWeeklyAnalyticsEmail).toHaveBeenCalledTimes(1)
    expect(sendSellerWeeklyAnalyticsEmail).toHaveBeenCalledWith({
      to: 'seller@example.com',
      ownerDisplayName: 'Test Seller',
      metrics: expect.objectContaining({
        totalViews: 100,
        totalSaves: 20,
        totalClicks: 10,
      }),
      weekStart: expect.any(String),
      weekEnd: expect.any(String),
    })
  })

  it('should skip owners with zero metrics', async () => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setUTCDate(weekStart.getUTCDate() - 7)
    weekStart.setUTCHours(0, 0, 0, 0)

    // Mock sales query
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            lt: vi.fn(() => Promise.resolve({
              data: [{ owner_id: 'owner-1' }],
              error: null,
            })),
          })),
        })),
      })),
    }).mockReturnValueOnce({
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

    // Mock zero metrics
    vi.mocked(getSellerWeeklyAnalytics).mockResolvedValue({
      totalViews: 0,
      totalSaves: 0,
      totalClicks: 0,
      topSales: [],
    })

    const result = await processSellerWeeklyAnalyticsJob({})

    expect(result.success).toBe(true)
    expect(sendSellerWeeklyAnalyticsEmail).not.toHaveBeenCalled()
  })

  it('should handle email send failures gracefully', async () => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setUTCDate(weekStart.getUTCDate() - 7)
    weekStart.setUTCHours(0, 0, 0, 0)

    // Mock sales query (same as successful test)
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            lt: vi.fn(() => Promise.resolve({
              data: [{ owner_id: 'owner-1' }],
              error: null,
            })),
          })),
        })),
      })),
    }).mockReturnValueOnce({
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

    // Mock metrics (same as successful test)
    vi.mocked(getSellerWeeklyAnalytics).mockResolvedValue({
      totalViews: 100,
      totalSaves: 20,
      totalClicks: 10,
      topSales: [
        {
          saleId: 'sale-1',
          saleTitle: 'Test Sale',
          views: 100,
          saves: 20,
          clicks: 10,
          ctr: 10.0,
        },
      ],
    })

    // Mock failed email send (this is the only difference)
    vi.mocked(sendSellerWeeklyAnalyticsEmail).mockResolvedValue({
      ok: false,
      error: 'Email send failed',
    })

    const result = await processSellerWeeklyAnalyticsJob({})

    expect(result.success).toBe(true) // Job should still succeed even if some emails fail
    expect(sendSellerWeeklyAnalyticsEmail).toHaveBeenCalledTimes(1)
  })
})

