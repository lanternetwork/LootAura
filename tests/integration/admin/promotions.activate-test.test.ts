/**
 * Integration tests for POST /api/admin/promotions/activate-test
 * - Admin access required
 * - Handles multiple existing promotions correctly
 * - Expires all live promotions before creating new one
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockFromBase = vi.fn()
const mockAdminDb = vi.fn()
let currentUser: any = { id: 'admin-1', email: 'admin@example.test' }

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: currentUser },
          error: null,
        })
      ),
    },
  }),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => mockFromBase(db, table),
}))

const mockAssertAdminOrThrow = vi.fn()

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...args: any[]) => mockAssertAdminOrThrow(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler,
}))

describe('POST /api/admin/promotions/activate-test', () => {
  let handler: (request: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    currentUser = { id: 'admin-1', email: 'admin@example.test' }
    mockAssertAdminOrThrow.mockResolvedValue({ user: currentUser })

    // Mock ENABLE_ADMIN_TOOLS check (allow in test)
    // Set env vars to allow admin tools in test environment
    if (typeof process.env.ENABLE_ADMIN_TOOLS === 'undefined') {
      process.env.ENABLE_ADMIN_TOOLS = 'true'
    }
    if (typeof process.env.NODE_ENV === 'undefined') {
      process.env.NODE_ENV = 'test'
    }

    const module = await import('@/app/api/admin/promotions/activate-test/route')
    handler = module.POST
  })

  it('expires all existing live promotions before creating new one (multi-promotion case)', async () => {
    const saleId = 'sale-123'
    const existingPromo1 = { id: 'promo-1', status: 'active' }
    const existingPromo2 = { id: 'promo-2', status: 'pending' }
    const newPromo = {
      id: 'promo-3',
      sale_id: saleId,
      status: 'active',
      starts_at: '2025-01-15T12:00:00.000Z',
      ends_at: '2025-01-22T12:00:00.000Z',
      tier: 'featured_week',
    }

    // Track calls to verify bulk expire happened
    const updateSpy = vi.fn()
    const insertSpy = vi.fn()

    let queryCallCount = 0

    mockFromBase.mockImplementation((_db: any, table: string) => {
      if (table === 'sales') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(() =>
            Promise.resolve({
              data: {
                id: saleId,
                owner_id: 'owner-1',
                status: 'published',
                date_start: '2025-01-20',
              },
              error: null,
            })
          ),
        }
        return chain
      }

      if (table === 'promotions') {
        queryCallCount++
        
        // First call: select existing promotions
        if (queryCallCount === 1) {
          const selectChain: any = {
            select: vi.fn(() => selectChain),
            eq: vi.fn(() => selectChain),
            in: vi.fn(() =>
              Promise.resolve({
                data: [existingPromo1, existingPromo2],
                error: null,
              })
            ),
          }
          return selectChain
        }

        // Second call: update (expire) existing promotions
        if (queryCallCount === 2) {
          const updateChain: any = {
            update: vi.fn(() => {
              updateSpy()
              return {
                in: vi.fn(() => ({
                  in: vi.fn(() =>
                    Promise.resolve({
                      data: null,
                      error: null,
                    })
                  ),
                })),
              }
            }),
          }
          return updateChain
        }

        // Third call: insert new promotion
        if (queryCallCount === 3) {
          const insertChain: any = {
            insert: vi.fn(() => {
              insertSpy()
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: newPromo,
                      error: null,
                    })
                  ),
                })),
              }
            }),
          }
          return insertChain
        }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      }
    })

    const request = new NextRequest('http://localhost/api/admin/promotions/activate-test', {
      method: 'POST',
      body: JSON.stringify({
        sale_id: saleId,
        mode: 'now_plus_7',
        tier: 'featured_week',
      }),
    })

    const res = await handler(request)
    const json = await res.json()

    // Should succeed
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.promotion).toBeDefined()
    expect(json.promotion.id).toBe('promo-3')
    expect(json.promotion.sale_id).toBe(saleId)

    // Verify bulk expire update was called
    expect(updateSpy).toHaveBeenCalledTimes(1)

    // Verify new promotion insert was called
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  it('handles case with no existing promotions (idempotent)', async () => {
    const saleId = 'sale-456'
    const newPromo = {
      id: 'promo-new',
      sale_id: saleId,
      status: 'active',
      starts_at: '2025-01-15T12:00:00.000Z',
      ends_at: '2025-01-22T12:00:00.000Z',
      tier: 'featured_week',
    }

    const insertSpy = vi.fn()
    let queryCallCount = 0

    mockFromBase.mockImplementation((_db: any, table: string) => {
      if (table === 'sales') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(() =>
            Promise.resolve({
              data: {
                id: saleId,
                owner_id: 'owner-1',
                status: 'published',
                date_start: '2025-01-20',
              },
              error: null,
            })
          ),
        }
        return chain
      }

      if (table === 'promotions') {
        queryCallCount++
        
        // First call: select existing promotions (returns empty)
        if (queryCallCount === 1) {
          const selectChain: any = {
            select: vi.fn(() => selectChain),
            eq: vi.fn(() => selectChain),
            in: vi.fn(() =>
              Promise.resolve({
                data: [],
                error: null,
              })
            ),
          }
          return selectChain
        }

        // Second call: insert new promotion
        if (queryCallCount === 2) {
          const insertChain: any = {
            insert: vi.fn(() => {
              insertSpy()
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: newPromo,
                      error: null,
                    })
                  ),
                })),
              }
            }),
          }
          return insertChain
        }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      }
    })

    const request = new NextRequest('http://localhost/api/admin/promotions/activate-test', {
      method: 'POST',
      body: JSON.stringify({
        sale_id: saleId,
        mode: 'now_plus_7',
      }),
    })

    const res = await handler(request)
    const json = await res.json()

    // Should succeed
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.promotion).toBeDefined()

    // Verify new promotion was created
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })
})
