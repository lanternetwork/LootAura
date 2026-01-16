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
    // NODE_ENV is already 'test' in vitest, so we don't need to set it
    if (typeof process.env.ENABLE_ADMIN_TOOLS === 'undefined') {
      process.env.ENABLE_ADMIN_TOOLS = 'true'
    }

    const module = await import('@/app/api/admin/promotions/activate-test/route')
    handler = module.POST
  })

  it('expires all existing live promotions before creating new one (multi-promotion case)', async () => {
    const saleId = '123e4567-e89b-12d3-a456-426614174000'
    const existingPromo1 = { id: '111e4567-e89b-12d3-a456-426614174010', status: 'active' }
    const existingPromo2 = { id: '222e4567-e89b-12d3-a456-426614174011', status: 'pending' }
    const newPromo = {
      id: '333e4567-e89b-12d3-a456-426614174012',
      sale_id: saleId,
      status: 'active',
      starts_at: '2025-01-15T12:00:00.000Z',
      ends_at: '2025-01-22T12:00:00.000Z',
      tier: 'featured_week',
    }

    // Track calls to verify bulk expire happened and capture update payload
    const updateSpy = vi.fn()
    const insertSpy = vi.fn()
    let updatePayload: any = null

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
            update: vi.fn((payload: any) => {
              updateSpy()
              updatePayload = payload // Capture the update payload
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
    expect(json.promotion.id).toBe('333e4567-e89b-12d3-a456-426614174012')
    expect(json.promotion.sale_id).toBe(saleId)
    expect(json.promotion.status).toBe('active')
    expect(json.promotion.tier).toBe('featured_week')

    // Harden timestamp assertions: presence, validity, and ordering
    expect(json.promotion.starts_at).toBeDefined()
    expect(json.promotion.starts_at).toBeTypeOf('string')
    const startsAtDate = new Date(json.promotion.starts_at)
    expect(isNaN(startsAtDate.getTime())).toBe(false) // Valid date

    expect(json.promotion.ends_at).toBeDefined()
    expect(json.promotion.ends_at).toBeTypeOf('string')
    const endsAtDate = new Date(json.promotion.ends_at)
    expect(isNaN(endsAtDate.getTime())).toBe(false) // Valid date

    // Assert ordering: ends_at > starts_at
    expect(endsAtDate.getTime()).toBeGreaterThan(startsAtDate.getTime())

    // Assert bulk-expire update includes terminal fields
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updatePayload).toBeDefined()
    expect(updatePayload.status).toBe('expired')
    expect(updatePayload.ends_at).toBeDefined()
    expect(updatePayload.ends_at).toBeTypeOf('string')
    expect(updatePayload.updated_at).toBeDefined()
    expect(updatePayload.updated_at).toBeTypeOf('string')
    // Verify ends_at and updated_at are valid dates
    expect(isNaN(new Date(updatePayload.ends_at).getTime())).toBe(false)
    expect(isNaN(new Date(updatePayload.updated_at).getTime())).toBe(false)

    // Regression guard: verify only one live promo remains
    // - Two existing promos were expired (update called once with both IDs)
    // - One new promo was created (insert called once)
    // - Response shows one active promotion
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(json.promotion.status).toBe('active') // Only one active promo in response
  })

  it('handles case with no existing promotions (idempotent)', async () => {
    const saleId = '456e7890-e89b-12d3-a456-426614174001'
    const newPromo = {
      id: '444e4567-e89b-12d3-a456-426614174020',
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
    expect(json.promotion.status).toBe('active')
    expect(json.promotion.tier).toBe('featured_week')

    // Harden timestamp assertions: presence, validity, and ordering
    expect(json.promotion.starts_at).toBeDefined()
    expect(json.promotion.starts_at).toBeTypeOf('string')
    const startsAtDate = new Date(json.promotion.starts_at)
    expect(isNaN(startsAtDate.getTime())).toBe(false) // Valid date

    expect(json.promotion.ends_at).toBeDefined()
    expect(json.promotion.ends_at).toBeTypeOf('string')
    const endsAtDate = new Date(json.promotion.ends_at)
    expect(isNaN(endsAtDate.getTime())).toBe(false) // Valid date

    // Assert ordering: ends_at > starts_at
    expect(endsAtDate.getTime()).toBeGreaterThan(startsAtDate.getTime())

    // Verify new promotion was created
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })
})
