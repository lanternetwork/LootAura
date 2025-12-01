/**
 * Integration tests for Favorite Sales Starting Soon job
 * 
 * Note: These tests mock the database and email sending to verify
 * the job logic without requiring a real database or sending emails.
 * 
 * The job now sends digest emails (one per user) instead of one email per favorite.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'
import { sendFavoriteSalesStartingSoonDigestEmail } from '@/lib/email/favorites'

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

vi.mock('@/lib/data/profileAccess', () => ({
  getUserProfile: vi.fn().mockResolvedValue({ display_name: 'Test User' }),
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
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  }),
}))

describe('processFavoriteSalesStartingSoonJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    process.env.EMAIL_FAVORITE_SALE_STARTING_SOON_ENABLED = 'true'
    process.env.EMAIL_FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START = '24'
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
    expect(sendFavoriteSalesStartingSoonDigestEmail).not.toHaveBeenCalled()
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
    expect(sendFavoriteSalesStartingSoonDigestEmail).not.toHaveBeenCalled()
  })

  it('should send digest email for single favorite per user and update start_soon_notified_at', async () => {
    const now = new Date()
    // Create a sale that starts in 12 hours (definitely within 24-hour window, accounts for timezone differences)
    // Use a larger offset to ensure it passes the date filter even with timezone parsing differences
    const futureDate = new Date(now.getTime() + 12 * 60 * 60 * 1000)
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

    // Mock successful digest email send
    vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mockResolvedValue({ ok: true })

    const result = await processFavoriteSalesStartingSoonJob({})

    expect(result.success).toBe(true)
    // Should send one digest email per user (not per favorite)
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledTimes(1)
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      sales: [mockSale],
      userName: 'Test User',
      hoursBeforeStart: 24, // Default from config
    })

    // Verify that start_soon_notified_at was updated
    expect(mockFromBase).toHaveBeenCalledWith(
      expect.anything(),
      'favorites'
    )
  })

  it('should send one digest email for multiple favorites from the same user', async () => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const futureTimeStr = futureDate.toISOString().split('T')[1].substring(0, 5)

    const mockSale1 = {
      id: 'sale-1',
      owner_id: 'owner-1',
      title: 'First Sale',
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

    const mockSale2 = {
      id: 'sale-2',
      owner_id: 'owner-2',
      title: 'Second Sale',
      address: '456 Oak Ave',
      city: 'City',
      state: 'ST',
      date_start: futureDateStr,
      time_start: futureTimeStr,
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    // Mock favorites query - same user, multiple favorites
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve({
          data: [
            { user_id: 'user-1', sale_id: 'sale-1', start_soon_notified_at: null },
            { user_id: 'user-1', sale_id: 'sale-2', start_soon_notified_at: null },
          ],
          error: null,
        })),
      })),
    }).mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [mockSale1, mockSale2],
            error: null,
          })),
        })),
      })),
    })
    // Mock update calls - need one for each favorite (2 favorites = 2 update calls)
    const createUpdateChain = () => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({
          data: null,
          error: null,
        })),
      })),
    })
    mockFromBase.mockReturnValueOnce({
      update: vi.fn(() => createUpdateChain()),
    }).mockReturnValueOnce({
      update: vi.fn(() => createUpdateChain()),
    })

    vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mockResolvedValue({ ok: true })

    const result = await processFavoriteSalesStartingSoonJob({})

    expect(result.success).toBe(true)
    // Should send only ONE digest email for the user, containing both sales
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledTimes(1)
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      sales: expect.arrayContaining([mockSale1, mockSale2]),
      userName: 'Test User',
      hoursBeforeStart: 24,
    })
    // Verify both sales are in the digest
    const callArgs = vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mock.calls[0][0]
    expect(callArgs.sales).toHaveLength(2)
    expect(callArgs.sales.map((s: any) => s.id)).toContain('sale-1')
    expect(callArgs.sales.map((s: any) => s.id)).toContain('sale-2')
  })

  it('should send separate digest emails for multiple users', async () => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const futureTimeStr = futureDate.toISOString().split('T')[1].substring(0, 5)

    const mockSale1 = {
      id: 'sale-1',
      owner_id: 'owner-1',
      title: 'First Sale',
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

    const mockSale2 = {
      id: 'sale-2',
      owner_id: 'owner-2',
      title: 'Second Sale',
      address: '456 Oak Ave',
      city: 'City',
      state: 'ST',
      date_start: futureDateStr,
      time_start: futureTimeStr,
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    // Mock favorites query - different users
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve({
          data: [
            { user_id: 'user-1', sale_id: 'sale-1', start_soon_notified_at: null },
            { user_id: 'user-2', sale_id: 'sale-2', start_soon_notified_at: null },
          ],
          error: null,
        })),
      })),
    }).mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [mockSale1, mockSale2],
            error: null,
          })),
        })),
      })),
    })
    // Mock update calls - need one for each favorite (2 users, 1 favorite each = 2 update calls)
    const createUpdateChain = () => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({
          data: null,
          error: null,
        })),
      })),
    })
    mockFromBase.mockReturnValueOnce({
      update: vi.fn(() => createUpdateChain()),
    }).mockReturnValueOnce({
      update: vi.fn(() => createUpdateChain()),
    })

    // Mock users list with both users
    mockAuthUsersQuery.mockResolvedValue({
      data: {
        users: [
          { id: 'user-1', email: 'user1@example.com' },
          { id: 'user-2', email: 'user2@example.com' },
        ],
      },
      error: null,
    })

    vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mockResolvedValue({ ok: true })

    const result = await processFavoriteSalesStartingSoonJob({})

    expect(result.success).toBe(true)
    // Should send one digest email per user
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledTimes(2)
    // Verify user-1 gets their sale
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledWith({
      to: 'user1@example.com',
      sales: [mockSale1],
      userName: 'Test User',
      hoursBeforeStart: 24,
    })
    // Verify user-2 gets their sale
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledWith({
      to: 'user2@example.com',
      sales: [mockSale2],
      userName: 'Test User',
      hoursBeforeStart: 24,
    })
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
    expect(sendFavoriteSalesStartingSoonDigestEmail).not.toHaveBeenCalled()
  })

  it('should handle email send failures gracefully', async () => {
    const now = new Date()
    // Create a sale that starts in 12 hours (definitely within 24-hour window, accounts for timezone differences)
    // Use a larger offset to ensure it passes the date filter even with timezone parsing differences
    const futureDate = new Date(now.getTime() + 12 * 60 * 60 * 1000)
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

    // Ensure auth.admin.listUsers() mock is set up (it's in beforeEach, but ensure it's fresh)
    mockAuthUsersQuery.mockResolvedValue({
      data: { users: [{ id: 'user-1', email: 'user@example.com' }] },
      error: null,
    })

    // Mock failed digest email send
    vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mockResolvedValue({
      ok: false,
      error: 'Email send failed',
    })

    const result = await processFavoriteSalesStartingSoonJob({})

    // Job should still succeed even if some emails fail
    if (!result.success) {
      throw new Error(`Job failed with error: ${result.error}`)
    }
    expect(result.success).toBe(true)
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledTimes(1)
  })

  it('should handle partial failures - one user succeeds, one fails', async () => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const futureTimeStr = futureDate.toISOString().split('T')[1].substring(0, 5)

    const mockSale1 = {
      id: 'sale-1',
      owner_id: 'owner-1',
      title: 'First Sale',
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

    const mockSale2 = {
      id: 'sale-2',
      owner_id: 'owner-2',
      title: 'Second Sale',
      address: '456 Oak Ave',
      city: 'City',
      state: 'ST',
      date_start: futureDateStr,
      time_start: futureTimeStr,
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    // Shared mocks for favorites select and update so we can assert on calls
    const favoritesSelectIsMock = vi.fn(() =>
      Promise.resolve({
        data: [
          { user_id: 'user-1', sale_id: 'sale-1', start_soon_notified_at: null },
          { user_id: 'user-2', sale_id: 'sale-2', start_soon_notified_at: null },
        ],
        error: null,
      }),
    )
    const favoritesUpdateEqMock = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: null,
      }),
    )

    mockFromBase.mockImplementation((db: any, table: string) => {
      if (table === 'favorites') {
        // fromBase(admin, 'favorites') is used both for the initial select and for per-favorite updates.
        // We expose both methods and track calls via the shared mocks above.
        return {
          select: vi.fn(() => ({
            is: favoritesSelectIsMock,
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: favoritesUpdateEqMock,
            })),
          })),
        }
      }

      if (table === 'sales') {
        // fromBase(admin, 'sales').select(...).in(...).eq(...)
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(() =>
                Promise.resolve({
                  data: [mockSale1, mockSale2],
                  error: null,
                }),
              ),
            })),
          })),
        }
      }

      // Fallback: return object with both methods to avoid errors
      return {
        select: vi.fn(() => ({ is: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
        })),
      }
    })

    // Mock users list with both users
    mockAuthUsersQuery.mockResolvedValue({
      data: {
        users: [
          { id: 'user-1', email: 'user1@example.com' },
          { id: 'user-2', email: 'user2@example.com' },
        ],
      },
      error: null,
    })

    // Mock: user-1 succeeds, user-2 fails
    // Note: Map iteration order is not guaranteed, so we need to handle both orders
    vi.mocked(sendFavoriteSalesStartingSoonDigestEmail)
      .mockResolvedValueOnce({ ok: true }) // First user succeeds
      .mockResolvedValueOnce({ ok: false, error: 'Email send failed' }) // Second user fails

    const result = await processFavoriteSalesStartingSoonJob({})

    // Job should return success even if some emails fail (errors are logged but don't fail the job)
    if (!result.success) {
      // Log debug info for CI if this ever regresses
      // Note: console.log is allowed by the test harness; console.error would fail the test.
      // This helps us see the underlying error without changing job behavior.
      // eslint-disable-next-line no-console
      console.log('PARTIAL_FAILURE_JOB_RESULT', result)
    }
    expect(result.success).toBe(true)
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledTimes(2)
    // Only the successful email's favorites should be marked as notified.
    // We expect exactly one successful update (for user-1's favorite).
    expect(favoritesUpdateEqMock).toHaveBeenCalledTimes(1)
  })

  it('should be idempotent - second run should not send emails for already notified favorites', async () => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const futureTimeStr = futureDate.toISOString().split('T')[1].substring(0, 5)

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

    // First run: favorite has null start_soon_notified_at
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

    vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mockResolvedValue({ ok: true })

    const result1 = await processFavoriteSalesStartingSoonJob({})
    expect(result1.success).toBe(true)
    expect(sendFavoriteSalesStartingSoonDigestEmail).toHaveBeenCalledTimes(1)

    // Clear mocks for second run
    vi.clearAllMocks()
    // Reset and re-mock the email function to track calls (clearAllMocks clears module-level mocks)
    vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mockReset()
    vi.mocked(sendFavoriteSalesStartingSoonDigestEmail).mockResolvedValue({ ok: true })
    // Reset mockFromBase to clear call history
    mockFromBase.mockReset()
    mockAuthUsersQuery.mockResolvedValue({
      data: { users: [{ id: 'user-1', email: 'user@example.com' }] },
      error: null,
    })

    // Second run: favorite now has start_soon_notified_at set (so it won't be in the query)
    // The job will call fromBase(admin, 'favorites') once for the select query
    // Since no favorites are found, the job should return early and not call fromBase for sales or updates
    mockFromBase.mockReturnValueOnce({
      select: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve({
          data: [], // Empty because start_soon_notified_at is now set
          error: null,
        })),
      })),
    })

    const result2 = await processFavoriteSalesStartingSoonJob({})
    expect(result2.success).toBe(true)
    // Should not send any emails on second run (no favorites found)
    expect(sendFavoriteSalesStartingSoonDigestEmail).not.toHaveBeenCalled()
  })
})

