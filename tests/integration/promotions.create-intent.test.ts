import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Stripe helper
vi.mock('@/lib/payments/stripe', () => ({
  createPromoteSaleIntent: vi.fn(async ({ amountCents }: any) => ({ id: 'pi_test', client_secret: 'cs_test', amount: amountCents }))
}))

// Mock Supabase server client
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    },
    from: mockFrom
  })
}))

let POST: any
beforeAll(async () => {
  const route = await import('@/app/api/promotions/sales/route')
  POST = route.POST
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Promotions API - Create PaymentIntent', () => {
  it('should create PaymentIntent for owned sale', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'sale-1', owner_id: 'user-1' }, error: null }) }) }) }
      }
      if (table === 'payments') {
        return { insert: () => ({}) }
      }
      return {}
    })

    const req = new NextRequest('http://localhost:3000/api/promotions/sales', { method: 'POST', body: JSON.stringify({ saleId: 'sale-1' }) })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.clientSecret).toBeDefined()
  })

  it('should 404 for unowned sale', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'sale-1', owner_id: 'other-user' }, error: null }) }) }) }
      }
      return {}
    })
    const req = new NextRequest('http://localhost:3000/api/promotions/sales', { method: 'POST', body: JSON.stringify({ saleId: 'sale-1' }) })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('should 409 if already promoted and not expired', async () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'sale-1', owner_id: 'user-1', is_promoted: true, promoted_until: future }, error: null }) }) }) }
      }
      return {}
    })
    const req = new NextRequest('http://localhost:3000/api/promotions/sales', { method: 'POST', body: JSON.stringify({ saleId: 'sale-1' }) })
    const res = await POST(req)
    expect(res.status).toBe(409)
  })
})


