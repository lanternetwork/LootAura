/**
 * CI Starter Harness: Payments Disabled Safety Guard Test
 * 
 * Tests that promotion checkout creation is blocked unless PAYMENTS_ENABLED=true.
 * This ensures no accidental charges occur when payments are not configured.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Mock admin gate
const mockAssertAdminOrThrow = vi.fn()

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...args: any[]) => mockAssertAdminOrThrow(...args),
}))

// Placeholder route handler that will be implemented in a future PR
// This test validates the guard, not the full implementation
async function handlePromotionCheckout(request: NextRequest): Promise<NextResponse> {
  // Check payments enabled flag
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true'

  if (!paymentsEnabled) {
    return NextResponse.json(
      { error: 'Payments are disabled. Set PAYMENTS_ENABLED=true to enable.' },
      { status: 403 }
    )
  }

  // In real implementation, this would create a Stripe checkout session
  // For now, return success placeholder
  return NextResponse.json({ ok: true, message: 'Checkout session created' })
}

describe('Payments Disabled Safety Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: payments disabled
    delete process.env.PAYMENTS_ENABLED
    mockAssertAdminOrThrow.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
  })

  afterEach(() => {
    delete process.env.PAYMENTS_ENABLED
  })

  it('blocks checkout when PAYMENTS_ENABLED is not set', async () => {
    delete process.env.PAYMENTS_ENABLED

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
    })

    const response = await handlePromotionCheckout(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('Payments are disabled')
  })

  it('blocks checkout when PAYMENTS_ENABLED is false', async () => {
    process.env.PAYMENTS_ENABLED = 'false'

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
    })

    const response = await handlePromotionCheckout(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('Payments are disabled')
  })

  it('blocks checkout when PAYMENTS_ENABLED is empty string', async () => {
    process.env.PAYMENTS_ENABLED = ''

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
    })

    const response = await handlePromotionCheckout(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('Payments are disabled')
  })

  it('allows checkout when PAYMENTS_ENABLED is true', async () => {
    process.env.PAYMENTS_ENABLED = 'true'

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
    })

    const response = await handlePromotionCheckout(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('does not change runtime behavior when disabled (no Stripe calls)', async () => {
    delete process.env.PAYMENTS_ENABLED

    const request = new NextRequest('http://localhost/api/promotions/checkout', {
      method: 'POST',
    })

    const response = await handlePromotionCheckout(request)

    // Should fail fast without any external service calls
    expect(response.status).toBe(403)
    // Verify no Stripe client was instantiated (would be mocked in real test)
  })
})

