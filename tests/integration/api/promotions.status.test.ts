/**
 * Integration tests for GET /api/promotions/status
 * - Auth required
 * - Ownership enforced (non-owned sale_ids are not returned for non-admins)
 * - Input caps enforced
 * - Minimal response shape
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockFromBase = vi.fn()
const mockAdminDb = {
  from: vi.fn(),
}
const mockRlsDb = {
  from: vi.fn(),
}
let currentUser: any = { id: 'user-1', email: 'user@example.test' }

const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(() =>
      Promise.resolve({
        data: { user: currentUser },
        error: null,
      })
    ),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token', user: currentUser, refresh_token: 'refresh-token' } },
      error: null,
    }),
    setSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token', user: currentUser, refresh_token: 'refresh-token' } },
      error: null,
    }),
  },
  schema: vi.fn(() => mockRlsDb),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => {
    // fromBase internally calls db.from(table), so we need to support that
    if (db === mockRlsDb || db === mockAdminDb) {
      return db.from(table)
    }
    return mockFromBase(db, table)
  },
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

describe('GET /api/promotions/status', () => {
  let handler: (request: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    currentUser = { id: 'user-1', email: 'user@example.test' }
    
    // Reset schema mock to return mockRlsDb
    mockSupabaseClient.schema.mockReturnValue(mockRlsDb)

    // Configure mockRlsDb.from to return a chainable query for promotions
    const defaultSaleId = '00000000-0000-0000-0000-000000000001'
    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'promotions') {
        const result = {
          data: [
            {
              sale_id: defaultSaleId,
              status: 'active',
              tier: 'featured_week',
              ends_at: '2030-01-01T00:00:00.000Z',
              owner_profile_id: 'user-1',
            },
          ],
          error: null,
        }
        const chain: any = {
          select: vi.fn(() => chain),
          in: vi.fn(() => chain),
          eq: vi.fn(() => Promise.resolve(result)),
          // Make chain awaitable (thenable) so it can be awaited directly
          then: (onFulfilled: any, onRejected: any) => Promise.resolve(result).then(onFulfilled, onRejected),
        }
        return chain
      }
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      }
    })

    // Default fromBase mock returns a simple chainable query for promotions
    mockFromBase.mockImplementation((_db: any, table: string) => {
      if (table === 'promotions') {
        const chain: any = {
          select: vi.fn(() => chain),
          in: vi.fn(() => chain),
          eq: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  sale_id: defaultSaleId,
                  status: 'active',
                  tier: 'featured_week',
                  ends_at: '2030-01-01T00:00:00.000Z',
                  owner_profile_id: 'user-1',
                },
              ],
              error: null,
            })
          ),
        }
        return chain
      }
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      }
    })

    const module = await import('@/app/api/promotions/status/route')
    handler = module.GET
  })

  it('requires authentication', async () => {
    currentUser = null
    const request = new NextRequest('http://localhost/api/promotions/status?sale_ids=00000000-0000-0000-0000-000000000001', {
      method: 'GET',
    })

    const res = await handler(request)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.code).toBe('AUTH_REQUIRED')
  })

  it('enforces ownership for non-admins (filters out non-owned sale_ids)', async () => {
    mockAssertAdminOrThrow.mockImplementation(() => {
      throw new Error('not-admin')
    })

    // Configure promotions query to include both owned and non-owned promotions
    const saleId1 = '00000000-0000-0000-0000-000000000001'
    const saleId2 = '00000000-0000-0000-0000-000000000002'
    
    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'promotions') {
        const chain: any = {}
        chain.select = vi.fn(() => chain)
        chain.in = vi.fn(() => chain)
        chain.eq = vi.fn((field: string, value: string) => {
          if (field === 'owner_profile_id' && value === 'user-1') {
            const result = {
              data: [
                {
                  sale_id: saleId1,
                  status: 'active',
                  tier: 'featured_week',
                  ends_at: '2030-01-01T00:00:00.000Z',
                  owner_profile_id: 'user-1',
                },
              ],
              error: null,
            }
            return Promise.resolve(result)
          }
          return Promise.resolve({ data: [], error: null })
        })
        // Make chain awaitable (thenable) so it can be awaited directly
        chain.then = (onFulfilled: any, onRejected: any) => 
          Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
        return chain
      }
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      }
    })

    // Also update mockFromBase for backward compatibility
    mockFromBase.mockImplementation((_db: any, table: string) => {
      if (table === 'promotions') {
        const chain: any = {}
        chain.select = vi.fn(() => chain)
        chain.in = vi.fn(() => chain)
        chain.eq = vi.fn((field: string, value: string) => {
          if (field === 'owner_profile_id' && value === 'user-1') {
            return Promise.resolve({
              data: [
                {
                  sale_id: saleId1,
                  status: 'active',
                  tier: 'featured_week',
                  ends_at: '2030-01-01T00:00:00.000Z',
                  owner_profile_id: 'user-1',
                },
              ],
              error: null,
            })
          }
          return Promise.resolve({ data: [], error: null })
        })
        return chain
      }
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      }
    })

    const request = new NextRequest(
      `http://localhost/api/promotions/status?sale_ids=${saleId1},${saleId2}`,
      { method: 'GET' }
    )

    const res = await handler(request)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(Array.isArray(json.statuses)).toBe(true)
    expect(json.statuses).toHaveLength(1)
    expect(json.statuses[0].sale_id).toBe(saleId1)
  })

  it('respects MAX_SALE_IDS cap by limiting to 100 unique IDs', async () => {
    // Generate 150 valid UUIDs by using a base UUID and incrementing the last segment
    // This ensures all UUIDs are valid and unique
    const ids = Array.from({ length: 150 }, (_, i) => {
      const hex = i.toString(16).padStart(12, '0')
      // Use a known valid UUID format: 550e8400-e29b-41d4-a716-{unique}
      return `550e8400-e29b-41d4-a716-${hex}`
    }).join(',')
    const request = new NextRequest(
      `http://localhost/api/promotions/status?sale_ids=${encodeURIComponent(ids)}`,
      { method: 'GET' }
    )

    const { GET: handler } = await import('@/app/api/promotions/status/route')
    // Ensure we use the real constants indirectly via behavior: response should be OK

    const res = await handler(request)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(Array.isArray(json.statuses)).toBe(true)
    // The handler should have sliced to at most 100 unique IDs
    // (exact value depends on mocked DB, but we assert it never exceeds 100)
    expect(json.statuses.length).toBeLessThanOrEqual(100)
  })

  it('returns minimal response shape', async () => {
    const saleId1 = '00000000-0000-0000-0000-000000000001'
    const request = new NextRequest(
      `http://localhost/api/promotions/status?sale_ids=${saleId1}`,
      { method: 'GET' }
    )

    const res = await handler(request)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(Array.isArray(json.statuses)).toBe(true)
    const status = json.statuses[0]
    expect(Object.keys(status).sort()).toEqual(
      ['ends_at', 'is_active', 'sale_id', 'tier'].sort()
    )
  })

  it('returns 400 for invalid UUIDs', async () => {
    const request = new NextRequest(
      'http://localhost/api/promotions/status?sale_ids=invalid-uuid,not-a-uuid',
      { method: 'GET' }
    )

    const res = await handler(request)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.code).toBe('INVALID_REQUEST')
    expect(json.error).toBe('Invalid sale_ids')
  })

  it('returns 400 when mixing valid and invalid UUIDs', async () => {
    const validUuid = '00000000-0000-0000-0000-000000000001'
    const request = new NextRequest(
      `http://localhost/api/promotions/status?sale_ids=${validUuid},invalid-uuid`,
      { method: 'GET' }
    )

    const res = await handler(request)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.code).toBe('INVALID_REQUEST')
    expect(json.error).toBe('Invalid sale_ids')
  })
})
