/**
 * CI Starter Harness: Payments Disabled Safety Guard Test
 * 
 * Tests that promotion checkout creation is blocked unless PAYMENTS_ENABLED=true.
 * This ensures no accidental charges occur when payments are not configured.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetStripeClient = vi.fn()
const mockIsPaymentsEnabled = vi.fn()
const mockIsPromotionsEnabled = vi.fn()

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: (...args: any[]) => mockGetStripeClient(...args),
  isPaymentsEnabled: () => mockIsPaymentsEnabled(),
  isPromotionsEnabled: () => mockIsPromotionsEnabled(),
  getFeaturedWeekPriceId: () => 'price_test',
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: { id: 'user-1', email: 'user@example.test' } },
          error: null,
        })
      ),
    },
  }),
}))

vi.mock('@/lib/api/csrfCheck', () => ({
  checkCsrfIfRequired: vi.fn(async () => null),
}))

vi.mock('@/lib/auth/accountLock', () => ({
  assertAccountNotLocked: vi.fn(async () => {}),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
  fromBase: () => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'sale-1',
            owner_id: 'user-1',
            status: 'published',
            archived_at: null,
            moderation_status: null,
          },
          error: null,
        }),
      })),
    })),
  }),
}))

describe('Payments Disabled Safety Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsPaymentsEnabled.mockReturnValue(false)
    mockIsPromotionsEnabled.mockReturnValue(true)
    mockGetStripeClient.mockReturnValue({})
  })

  afterEach(() => {
    mockIsPaymentsEnabled.mockReset()
    mockIsPromotionsEnabled.mockReset()
    mockGetStripeClient.mockReset()
  })

  it('blocks checkout when PAYMENTS_ENABLED is not set', async () => {
    mockIsPaymentsEnabled.mockReturnValue(false)

    const { POST } = await import('@/app/api/promotions/checkout/route')

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({ sale_id: 'sale-1', tier: 'featured_week' }),
    } as any)

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.code).toBe('PAYMENTS_DISABLED')
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })

  it('blocks checkout when PAYMENTS_ENABLED is false', async () => {
    mockIsPaymentsEnabled.mockReturnValue(false)

    const { POST } = await import('@/app/api/promotions/checkout/route')

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({ sale_id: 'sale-1', tier: 'featured_week' }),
    } as any)

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.code).toBe('PAYMENTS_DISABLED')
  })

  it('blocks checkout when PAYMENTS_ENABLED is empty string', async () => {
    mockIsPaymentsEnabled.mockReturnValue(false)

    const { POST } = await import('@/app/api/promotions/checkout/route')

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({ sale_id: 'sale-1', tier: 'featured_week' }),
    } as any)

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.code).toBe('PAYMENTS_DISABLED')
  })

  it('allows checkout when PAYMENTS_ENABLED is true', async () => {
    mockIsPaymentsEnabled.mockReturnValue(true)

    // Minimal Stripe client mock to satisfy handler
    mockGetStripeClient.mockReturnValue({
      prices: {
        retrieve: vi.fn().mockResolvedValue({ unit_amount: 500 }),
      },
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: 'cs_test',
            url: 'https://stripe.test/checkout/cs_test',
            customer: null,
          }),
        },
      },
    })

    const { POST } = await import('@/app/api/promotions/checkout/route')

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({ sale_id: 'sale-1', tier: 'featured_week' }),
    } as any)

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.checkoutUrl).toBeDefined()
  })

  it('does not change runtime behavior when disabled (no Stripe calls)', async () => {
    mockIsPaymentsEnabled.mockReturnValue(false)

    const { POST } = await import('@/app/api/promotions/checkout/route')

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({ sale_id: 'sale-1', tier: 'featured_week' }),
    } as any)

    const response = await POST(request)

    // Should fail fast without any external service calls
    expect(response.status).toBe(403)
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })
})



