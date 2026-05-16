/**
 * GET /api/public/listings — safe profiles_v2 lookup (no PostgREST filter injection).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '@/app/api/public/listings/route'
import { parsePublicListingsUserParam } from '@/lib/public/parsePublicListingsUserParam'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const USERNAME = 'seller_jane'

type ProfileChain = {
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

type SalesChain = {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  range: ReturnType<typeof vi.fn>
}

const mockSupabase = {
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabase,
}))

vi.mock('@/lib/sales/phase4PublicPublishedSaleReadFilters', () => ({
  applyPhase4PublicPublishedSaleReadFilters: (query: SalesChain) => query,
}))

function buildProfileChain(result: { data: { id: string; username: string } | null }) {
  const chain: ProfileChain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  return chain
}

function buildSalesChain(result: { data: unknown[]; count: number }) {
  const chain: SalesChain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    range: vi.fn().mockResolvedValue(result),
  }
  return chain
}

describe('parsePublicListingsUserParam', () => {
  it('accepts UUIDs', () => {
    expect(parsePublicListingsUserParam(USER_ID)).toEqual({ kind: 'id', value: USER_ID })
  })

  it('accepts username-safe handles', () => {
    expect(parsePublicListingsUserParam(USERNAME)).toEqual({ kind: 'username', value: USERNAME })
  })

  it('rejects filter-breaking characters', () => {
    expect(parsePublicListingsUserParam('alice,bob')).toBeNull()
    expect(parsePublicListingsUserParam('user) OR 1=1')).toBeNull()
    expect(parsePublicListingsUserParam('id.eq.evil')).toBeNull()
  })
})

describe('GET /api/public/listings', () => {
  let profileChain: ProfileChain
  let salesChain: SalesChain

  beforeEach(() => {
    vi.clearAllMocks()
    profileChain = buildProfileChain({ data: { id: USER_ID, username: USERNAME } })
    salesChain = buildSalesChain({
      data: [{ id: 'sale-1', title: 'Garage', cover_url: null, address: '1 Main', status: 'published', owner_id: USER_ID }],
      count: 1,
    })
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles_v2') {
        return { select: vi.fn(() => profileChain) }
      }
      if (table === 'sales_v2') {
        return salesChain
      }
      throw new Error(`unexpected table ${table}`)
    })
  })

  it('resolves profile by UUID with .eq(id) only', async () => {
    const res = await GET(new Request(`http://localhost/api/public/listings?user=${USER_ID}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ page: 1, hasMore: false })
    expect(body.items).toHaveLength(1)
    expect(profileChain.eq).toHaveBeenCalledWith('id', USER_ID)
    expect(profileChain.eq).not.toHaveBeenCalledWith('username', expect.anything())
    expect(salesChain.eq).toHaveBeenCalledWith('owner_id', USER_ID)
  })

  it('resolves profile by username with .eq(username) only', async () => {
    const res = await GET(new Request(`http://localhost/api/public/listings?user=${USERNAME}`))
    expect(res.status).toBe(200)
    expect(profileChain.eq).toHaveBeenCalledWith('username', USERNAME)
    expect(profileChain.eq).not.toHaveBeenCalledWith('id', expect.anything())
  })

  it('rejects malicious user param without querying profiles', async () => {
    const malicious = encodeURIComponent('evil,username.eq.other')
    const res = await GET(new Request(`http://localhost/api/public/listings?user=${malicious}`))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'invalid user' })
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it('returns 404 when profile is not found', async () => {
    profileChain = buildProfileChain({ data: null })
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles_v2') {
        return { select: vi.fn(() => profileChain) }
      }
      return salesChain
    })
    const res = await GET(new Request(`http://localhost/api/public/listings?user=${USERNAME}`))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'user not found' })
  })
})
