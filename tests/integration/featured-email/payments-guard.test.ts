/**
 * CI Starter Harness: Payments Disabled Safety Guard Test
 *
 * Now targets the real /api/promotions/checkout route to verify that:
 * - Requests are blocked unless PAYMENTS_ENABLED=true
 * - Stripe client is never instantiated when payments are disabled
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mocks for route dependencies
const mockGetStripeClient = vi.fn()
const mockIsPaymentsEnabled = vi.fn(() => process.env.PAYMENTS_ENABLED === 'true')
const mockIsPromotionsEnabled = vi.fn(() => true)

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => mockGetStripeClient(),
  isPaymentsEnabled: () => mockIsPaymentsEnabled(),
  isPromotionsEnabled: () => mockIsPromotionsEnabled(),
  getFeaturedWeekPriceId: () => 'price_test_featured_week',
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
    select: () => ({
      eq: () =>
        Promise.resolve({
          data: {
            id: 'sale-1',
            owner_id: 'user-1',
            status: 'published',
            archived_at: null,
            moderation_status: null,
          },
          error: null,
        }),
    }),
  }),
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler,
}))

vi.mock('@/lib/rateLimit/policies', () => ({
  Policies: {
    MUTATE_MINUTE: { name: 'MUTATE_MINUTE' },
  },
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Payments Disabled Safety Guard (real /api/promotions/checkout)', () => {
  let handler: (request: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    delete process.env.PAYMENTS_ENABLED
    process.env.PROMOTIONS_ENABLED = 'true'

    const module = await import('@/app/api/promotions/checkout/route')
    handler = module.POST
  })

  afterEach(() => {
    delete process.env.PAYMENTS_ENABLED
    delete process.env.PROMOTIONS_ENABLED
  })

  const makeRequest = () =>
    new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
    })

  it('blocks checkout when PAYMENTS_ENABLED is not set', async () => {
    delete process.env.PAYMENTS_ENABLED

    const response = await handler(makeRequest())
    const data = await response.json()

    expect(response.status).toBe(410)
    expect(data.code).toBe('DEPRECATED')
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })

  it('blocks checkout when PAYMENTS_ENABLED is false', async () => {
    process.env.PAYMENTS_ENABLED = 'false'

    const response = await handler(makeRequest())
    const data = await response.json()

    expect(response.status).toBe(410)
    expect(data.code).toBe('DEPRECATED')
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })

  it('blocks checkout when PAYMENTS_ENABLED is empty string', async () => {
    process.env.PAYMENTS_ENABLED = ''

    const response = await handler(makeRequest())
    const data = await response.json()

    expect(response.status).toBe(410)
    expect(data.code).toBe('DEPRECATED')
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })

  it('does not instantiate Stripe client when payments are disabled', async () => {
    delete process.env.PAYMENTS_ENABLED

    const response = await handler(makeRequest())

    expect(response.status).toBe(410)
    expect(mockGetStripeClient).not.toHaveBeenCalled()
  })
})
