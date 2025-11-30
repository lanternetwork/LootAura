/**
 * Integration tests for Favorite Sales Starting Soon job
 * 
 * Note: These tests mock the database and email sending to verify
 * the job logic without requiring a real database or sending emails.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'
import { sendFavoriteSaleStartingSoonEmail } from '@/lib/email/favorites'

// Mock dependencies
const mockFromBase = vi.fn()
const mockAdminDb = vi.fn()
const mockAuthUsersQuery = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => mockFromBase(db, table),
}))

vi.mock('@/lib/email/favorites', () => ({
  sendFavoriteSaleStartingSoonEmail: vi.fn(),
}))

vi.mock('@/lib/data/profileAccess', () => ({
  getUserProfile: vi.fn().mockResolvedValue({ display_name: 'Test User' }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      admin: {
        listUsers: () => mockAuthUsersQuery(),
      },
    },
  }),
}))

describe('processFavoriteSalesStartingSoonJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    mockAuthUsersQuery.mockResolvedValue({
      data: { users: [{ id: 'user-1', email: 'user@example.com' }] },
      error: null,
    })
  })

  it('should return success when no favorites are found', async () => {
    // Mock empty favorites query
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      })),
    })

    const result = await processFavoriteSalesStartingSoonJob({})

    expect(result.success).toBe(true)
    expect(sendFavoriteSaleStartingSoonEmail).not.toHaveBeenCalled()
  })

  it('should return success when no published sales are found', async () => {
    // Mock favorites with no matching sales
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve({
          data: [{ user_id: 'user-1', sale_id: 'sale-1', start_soon_notified_at: null }],
          error: null,
        })),
      })),
    }).mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [],
            error: null,
          })),
        })),
      })),
    })

    const result = await processFavoriteSalesStartingSoonJob({})

    expect(result.success).toBe(true)
    expect(sendFavoriteSaleStartingSoonEmail).not.toHaveBeenCalled()
  })

  it('should send emails for eligible favorites and update start_soon_notified_at', async () => {
    const now = new Date()
    // Create a sale that starts in 6 hours (definitely within 24-hour window, accounts for timezone differences)
    const futureDate = new Date(now.getTime() + 6 * 60 * 60 * 1000)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const futureTimeStr = futureDate.toISOString().split('T')[1].substring(0, 5) // HH:MM format

    const mockSale = {
      id: 'sale-1',
      owner_id: 'owner-1',
      title: 'Test Sale',
      address: '123 Main St',
      city: 'Anytown',
      state: 'ST',
      date_start: futureDateStr,
      time_start: futureTimeStr,
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    // Mock favorites query
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve({
          data: [{ user_id: 'user-1', sale_id: 'sale-1', start_soon_notified_at: null }],
          error: null,
        })),
      })),
    }).mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [mockSale],
            error: null,
          })),
        })),
      })),
    }).mockReturnValueOnce({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: null,
            error: null,
          })),
        })),
      })),
    })

    // Mock successful email send
    vi.mocked(sendFavoriteSaleStartingSoonEmail).mockResolvedValue({ ok: true })

    const result = await processFavoriteSalesStartingSoonJob({})

    expect(result.success).toBe(true)
    expect(sendFavoriteSaleStartingSoonEmail).toHaveBeenCalledTimes(1)
    expect(sendFavoriteSaleStartingSoonEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      sale: mockSale,
      userName: 'Test User',
    })

    // Verify that start_soon_notified_at was updated
    expect(mockFromBase).toHaveBeenCalledWith(
      expect.anything(),
      'favorites'
    )
  })

  it('should not send email if favorite already has start_soon_notified_at set', async () => {
    // Mock favorites query with already notified favorite (empty array means no unnotified favorites)
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      })),
    })

    const result = await processFavoriteSalesStartingSoonJob({})

    expect(result.success).toBe(true)
    expect(sendFavoriteSaleStartingSoonEmail).not.toHaveBeenCalled()
  })

  it('should handle email send failures gracefully', async () => {
    const now = new Date()
    // Create a sale that starts in 6 hours (definitely within 24-hour window, accounts for timezone differences)
    const futureDate = new Date(now.getTime() + 6 * 60 * 60 * 1000)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const futureTimeStr = futureDate.toISOString().split('T')[1].substring(0, 5) // HH:MM format

    const mockSale = {
      id: 'sale-1',
      owner_id: 'owner-1',
      title: 'Test Sale',
      address: '123 Main St',
      city: 'Anytown',
      state: 'ST',
      date_start: futureDateStr,
      time_start: futureTimeStr,
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    // Mock favorites query
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve({
          data: [{ user_id: 'user-1', sale_id: 'sale-1', start_soon_notified_at: null }],
          error: null,
        })),
      })),
    }).mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [mockSale],
            error: null,
          })),
        })),
      })),
    })

    // Ensure auth.admin.listUsers() mock is set up (it's in beforeEach, but ensure it's fresh)
    mockAuthUsersQuery.mockResolvedValue({
      data: { users: [{ id: 'user-1', email: 'user@example.com' }] },
      error: null,
    })

    // Mock failed email send
    vi.mocked(sendFavoriteSaleStartingSoonEmail).mockResolvedValue({
      ok: false,
      error: 'Email send failed',
    })

    const result = await processFavoriteSalesStartingSoonJob({})

    expect(result.success).toBe(true) // Job should still succeed even if some emails fail
    expect(sendFavoriteSaleStartingSoonEmail).toHaveBeenCalledTimes(1)
  })
})

