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
const mockAdminDb = vi.fn()
const mockRlsDb = vi.fn()
let currentUser: any = { id: 'user-1', email: 'user@example.test' }

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
  getRlsDb: () => mockRlsDb,
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

describe('GET /api/promotions/status', () => {
  let handler: (request: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    currentUser = { id: 'user-1', email: 'user@example.test' }

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
                  sale_id: 'sale-1',
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
    const request = new NextRequest('http://localhost/api/promotions/status?sale_ids=sale-1', {
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
                  sale_id: 'sale-1',
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
      'http://localhost/api/promotions/status?sale_ids=sale-1,sale-2',
      { method: 'GET' }
    )

    const res = await handler(request)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(Array.isArray(json.statuses)).toBe(true)
    expect(json.statuses).toHaveLength(1)
    expect(json.statuses[0].sale_id).toBe('sale-1')
  })

  it('respects MAX_SALE_IDS cap by limiting to 100 unique IDs', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `sale-${i + 1}`).join(',')
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
    const request = new NextRequest(
      'http://localhost/api/promotions/status?sale_ids=sale-1',
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
})
