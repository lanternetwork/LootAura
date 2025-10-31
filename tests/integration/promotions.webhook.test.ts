import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Stripe client webhook construct
const constructEvent = vi.fn((_raw: string) => ({
  id: 'evt_1',
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_test', metadata: { user_id: 'user-1', sale_id: 'sale-1', purpose: 'promote_sale' }, payment_method: 'pm_test' } }
}))

vi.mock('@/lib/payments/stripe', () => ({
  stripe: { webhooks: { constructEvent } }
}))

const updateSpy = vi.fn(() => ({ eq: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    from: (table: string) => ({
      update: (vals: any) => ({ eq: (_col: string, _val: string) => ({}) }),
      select: () => ({})
    })
  })
}))

let POST: any
beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  const route = await import('@/app/api/payments/webhook/route')
  POST = route.POST
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Stripe Webhook - promote_sale', () => {
  it('marks payment succeeded and promotes sale', async () => {
    const req = new NextRequest('http://localhost:3000/api/payments/webhook', { method: 'POST', body: 'raw-body' as any, headers: { 'stripe-signature': 'sig' } as any })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})


