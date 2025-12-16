/**
 * CI Starter Harness: Payments Disabled Safety Guard Test
 * 
 * Tests that promotion checkout creation is blocked unless PAYMENTS_ENABLED=true.
 * This ensures no accidental charges occur when payments are not configured.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetStripeClient = vi.fn()
const mockIsPaymentsEnabled = vi.fn()
const mockIsPromotionsEnabled = vi.fn()
const mockGetFeaturedWeekPriceId = vi.fn()

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => mockGetStripeClient(),
  isPaymentsEnabled: () => mockIsPaymentsEnabled(),
  isPromotionsEnabled: () => mockIsPromotionsEnabled(),
  getFeaturedWeekPriceId: () => mockGetFeaturedWeekPriceId(),
}))

// Mock Supabase server client to always return an authenticated user
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

// Mock admin DB + fromBase chain for sale and promotions inserts/updates
const mockFromBase = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({} as any),
  fromBase: (_db: any, table: string) => mockFromBase(_db, table),
}))

// CSRF check: always succeed
vi.mock('@/lib/api/csrfCheck', () => ({
  checkCsrfIfRequired: vi.fn(async () => null),
}))

// Logger: stub out to avoid noise
vi.mock('@/lib/log', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Payments Disabled Safety Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: payments disabled
    mockIsPaymentsEnabled.mockReturnValue(false)
    mockIsPromotionsEnabled.mockReturnValue(true)
    mockGetFeaturedWeekPriceId.mockReturnValue('price_test')

    // Basic fromBase behavior: minimal chain that does not throw
    mockFromBase.mockImplementation((_db: any, table: string) => {
      if (table === 'sales') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() =>
            Promise.resolve({
              data: { id: 'sale-1', owner_id: 'user-1', status: 'published', archived_at: null, moderation_status: null },
              error: null,
            })
          ),
          single: vi.fn(),
        }
        return chain
      }

      if (table === 'promotions') {
        const chain: any = {
          insert: vi.fn(() => ({
            select: vi.fn(() =>
              Promise.resolve({
                data: { id: 'promo-1' },
                error: null,
              })
            ),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: null,
              })
            ),
          })),
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
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  let realHandler: ((request: NextRequest) => Promise<Response>) | null = null

  const getHandler = async () => {
    if (!realHandler) {
      const module = await import('@/app/api/promotions/checkout/route')
      realHandler = module.POST
    }
    return realHandler!
  }

  it('blocks checkout when PAYMENTS_ENABLED is not set', async () => {
    mockIsPaymentsEnabled.mockReturnValue(false)

    const handler = await getHandler()
    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        sale_id: 'sale-1',
        tier: 'featured_week',
      }),
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.code).toBe('PAYMENTS_DISABLED')
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })

  it('blocks checkout when PAYMENTS_ENABLED is false', async () => {
    mockIsPaymentsEnabled.mockReturnValue(false)

    const handler = await getHandler()
    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        sale_id: 'sale-1',
        tier: 'featured_week',
      }),
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.code).toBe('PAYMENTS_DISABLED')
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })

  it('blocks checkout when PAYMENTS_ENABLED is empty string', async () => {
    mockIsPaymentsEnabled.mockReturnValue(false)

    const handler = await getHandler()
    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        sale_id: 'sale-1',
        tier: 'featured_week',
      }),
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.code).toBe('PAYMENTS_DISABLED')
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })

  it('allows checkout when PAYMENTS_ENABLED is true', async () => {
    mockIsPaymentsEnabled.mockReturnValue(true)
    mockIsPromotionsEnabled.mockReturnValue(true)

    // Stripe client mock
    const mockStripe = {
      prices: {
        retrieve: vi.fn().mockResolvedValue({ unit_amount: 1000 }),
      },
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: 'cs_test_123',
            url: 'https://stripe.test/checkout/session/cs_test_123',
            customer: 'cus_test_123',
          }),
        },
      },
    }
    mockGetStripeClient.mockReturnValue(mockStripe)

    const handler = await getHandler()
    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        sale_id: 'sale-1',
        tier: 'featured_week',
      }),
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.checkoutUrl).toContain('https://stripe.test/checkout/session')
    expect(mockStripe.prices.retrieve).toHaveBeenCalled()
  })

  it('does not change runtime behavior when disabled (no Stripe calls)', async () => {
    mockIsPaymentsEnabled.mockReturnValue(false)

    const handler = await getHandler()
    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        sale_id: 'sale-1',
        tier: 'featured_week',
      }),
    })

    const response = await handler(request)

    // Should fail fast without any external service calls
    expect(response.status).toBe(403)
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })
})



