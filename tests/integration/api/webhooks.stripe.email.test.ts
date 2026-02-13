/**
 * Integration tests for Stripe webhook email sending
 * Tests that finalizeDraftPromotion() sends sale created confirmation email
 * with promotion indicator and ensures idempotency.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/webhooks/stripe/route'

// Mock Supabase clients
const mockAdminDb = {
  from: vi.fn(),
}

const mockRlsDb = {
  from: vi.fn(),
}

let mockFromBaseImpl: ((db: any, table: string) => any) | undefined

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  getRlsDb: () => mockRlsDb,
  fromBase: (db: any, table: string) => {
    if (db === mockAdminDb) {
      return db.from(table)
    }
    if (db === mockRlsDb) {
      return db.from(table)
    }
    return mockFromBaseImpl ? mockFromBaseImpl(db, table) : { select: vi.fn(), update: vi.fn() }
  },
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock Stripe client
const mockStripe = {
  webhooks: {
    constructEvent: vi.fn(),
  },
}

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => mockStripe,
  getStripeWebhookSecret: () => 'whsec_test_secret',
}))

// Mock Supabase Admin API
const mockAdminBase = {
  auth: {
    admin: {
      getUserById: vi.fn(),
    },
  },
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockAdminBase),
}))

// Mock email functions
const mockCanSendEmail = vi.fn()
const mockRecordEmailSend = vi.fn()
const mockSendSaleCreatedEmail = vi.fn()

vi.mock('@/lib/email/emailLog', () => ({
  canSendEmail: (...args: any[]) => mockCanSendEmail(...args),
  recordEmailSend: (...args: any[]) => mockRecordEmailSend(...args),
}))

vi.mock('@/lib/email/sales', () => ({
  sendSaleCreatedEmail: (...args: any[]) => mockSendSaleCreatedEmail(...args),
}))

// Mock profile access
vi.mock('@/lib/data/profileAccess', () => ({
  getUserProfile: vi.fn().mockResolvedValue({ display_name: 'Test User' }),
}))

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}))

describe('Stripe webhook - finalizeDraftPromotion email sending', () => {
  const TEST_USER_ID = 'test-user-id-123'
  const TEST_USER_EMAIL = 'test@example.com'
  const TEST_DRAFT_KEY = 'test-draft-key-123'
  const TEST_PAYMENT_INTENT_ID = 'pi_test_1234567890'
  const TEST_SALE_ID = 'sale-id-123'
  const TEST_PROMOTION_ID = 'promotion-id-123'

  const mockDraft = {
    id: 'draft-id-123',
    user_id: TEST_USER_ID,
    draft_key: TEST_DRAFT_KEY,
    status: 'active',
    payload: {
      formData: {
        title: 'Test Sale',
        description: 'Test Description',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345',
        lat: 40.7128,
        lng: -74.0060,
        date_start: '2025-12-01',
        time_start: '10:00',
        date_end: '2025-12-01',
        time_end: '14:00',
        pricing_mode: 'negotiable',
      },
      photos: [],
      items: [],
      wantsPromotion: true,
    },
  }

  const mockSaleData = {
    id: TEST_SALE_ID,
    owner_id: TEST_USER_ID,
    title: 'Test Sale',
    description: 'Test Description',
    address: '123 Test St',
    city: 'Test City',
    state: 'TS',
    zip_code: '12345',
    lat: 40.7128,
    lng: -74.0060,
    date_start: '2025-12-01',
    time_start: '10:00',
    date_end: '2025-12-01',
    time_end: '14:00',
    status: 'published',
    privacy_mode: 'exact',
    is_featured: true,
    pricing_mode: 'negotiable',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFromBaseImpl = undefined

    // Setup environment variables for Admin API
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

    // Mock Stripe webhook verification
    mockStripe.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: TEST_PAYMENT_INTENT_ID,
          metadata: {
            draft_key: TEST_DRAFT_KEY,
            wants_promotion: 'true',
            owner_profile_id: TEST_USER_ID,
            tier: 'featured_week',
          },
        },
      },
    })

    // Mock RLS DB for draft query
    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'sale_drafts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockDraft, error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    // Mock Admin DB for sale creation
    let saleInsertCallCount = 0
    // Override mock implementation (stripe_webhook_events is already set up above, but we override to include all tables)
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'stripe_webhook_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // Event not processed yet
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnThis(),
        }
      }
      if (table === 'sales') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            saleInsertCallCount++
            if (saleInsertCallCount === 1) {
              // First call: sale creation
              return Promise.resolve({ data: { id: TEST_SALE_ID }, error: null })
            }
            // Subsequent calls: sale fetch for email
            return Promise.resolve({ data: mockSaleData, error: null })
          }),
          eq: vi.fn().mockReturnThis(),
        }
      }
      if (table === 'items') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      if (table === 'promotions') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: TEST_PROMOTION_ID },
            error: null,
          }),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      if (table === 'sale_drafts') {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockSaleData, error: null }),
      }
    })

    // Mock Admin API for user email
    mockAdminBase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: TEST_USER_ID,
          email: TEST_USER_EMAIL,
        },
      },
      error: null,
    })

    // Default: email can be sent (not already sent)
    mockCanSendEmail.mockResolvedValue(true)
    mockSendSaleCreatedEmail.mockResolvedValue({ ok: true })
    mockRecordEmailSend.mockResolvedValue(undefined)
  })

  /**
   * Helper to create a Stripe webhook request
   */
  function createStripeWebhookRequest(eventType: string = 'payment_intent.succeeded'): NextRequest {
    const payload = {
      type: eventType,
      data: {
        object: {
          id: TEST_PAYMENT_INTENT_ID,
          metadata: {
            draft_key: TEST_DRAFT_KEY,
            wants_promotion: 'true',
            owner_profile_id: TEST_USER_ID,
            tier: 'featured_week',
          },
        },
      },
    }

    const headers = new Headers({
      'stripe-signature': 'test-signature',
      'content-type': 'application/json',
    })

    return new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  }

  it('should send sale created email with isFeatured=true when promotion is finalized', async () => {
    const request = createStripeWebhookRequest()
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)

    // Verify email was sent with isFeatured=true
    expect(mockSendSaleCreatedEmail).toHaveBeenCalledTimes(1)
    expect(mockSendSaleCreatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sale: expect.objectContaining({
          id: TEST_SALE_ID,
          status: 'published',
        }),
        owner: {
          email: TEST_USER_EMAIL,
          displayName: 'Test User',
        },
        isFeatured: true,
        dedupeKey: `sale_created_promotion:${TEST_PAYMENT_INTENT_ID}`,
      })
    )

    // Verify email was recorded
    expect(mockRecordEmailSend).toHaveBeenCalledTimes(1)
    expect(mockRecordEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: TEST_USER_ID,
        emailType: 'sale_created_confirmation',
        toEmail: TEST_USER_EMAIL,
        dedupeKey: `sale_created_promotion:${TEST_PAYMENT_INTENT_ID}`,
        deliveryStatus: 'sent',
        meta: expect.objectContaining({
          saleId: TEST_SALE_ID,
          promotionId: TEST_PROMOTION_ID,
          paymentIntentId: TEST_PAYMENT_INTENT_ID,
          isFeatured: true,
        }),
      })
    )
  })

  it('should not send duplicate email on repeated webhook invocation with same payment intent', async () => {
    // First invocation - email can be sent
    mockCanSendEmail.mockResolvedValueOnce(true)
    
    const request1 = createStripeWebhookRequest()
    const response1 = await POST(request1)
    const data1 = await response1.json()

    expect(response1.status).toBe(200)
    expect(data1.ok).toBe(true)
    expect(mockSendSaleCreatedEmail).toHaveBeenCalledTimes(1)

    // Reset mocks but keep the email_log record (simulate idempotency check)
    vi.clearAllMocks()
    
    // Mock that email was already sent (idempotency check returns false)
    mockCanSendEmail.mockResolvedValueOnce(false)

    // Setup mocks for second invocation (idempotent path)
    // Draft is already deleted, so return null
    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'sale_drafts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    // Mock finding existing promotion (idempotency check at top of finalizeDraftPromotion)
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'promotions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: TEST_PROMOTION_ID,
              sale_id: TEST_SALE_ID,
            },
            error: null,
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    // Second invocation - should be idempotent (returns early, never reaches email code)
    const request2 = createStripeWebhookRequest()
    const response2 = await POST(request2)
    const data2 = await response2.json()

    expect(response2.status).toBe(200)
    expect(data2.ok).toBe(true)

    // Verify email was NOT sent again (function returned early due to idempotency)
    expect(mockSendSaleCreatedEmail).not.toHaveBeenCalled()
    expect(mockRecordEmailSend).not.toHaveBeenCalled()
    // canSendEmail should not be called because function returns early
    expect(mockCanSendEmail).not.toHaveBeenCalled()
  })

  it('should handle email send failure gracefully without breaking webhook', async () => {
    // Mock email send failure
    mockSendSaleCreatedEmail.mockResolvedValueOnce({
      ok: false,
      error: 'Resend API error',
    })

    const request = createStripeWebhookRequest()
    const response = await POST(request)
    const data = await response.json()

    // Webhook should still succeed
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)

    // Verify failed email was recorded with deliveryStatus: 'failed' (not 'sent')
    expect(mockRecordEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryStatus: 'failed',
        errorMessage: 'Email send failed', // Fixed non-sensitive error message
      })
    )

    // Explicitly verify deliveryStatus is 'failed' and not 'sent'
    const recordCall = mockRecordEmailSend.mock.calls.find(call => 
      call[0].deliveryStatus === 'failed'
    )
    expect(recordCall).toBeDefined()
    if (recordCall) {
      expect(recordCall[0].deliveryStatus).toBe('failed')
      expect(recordCall[0].deliveryStatus).not.toBe('sent')
    }
  })

  it('should skip email if user email is not available', async () => {
    // Mock user without email
    mockAdminBase.auth.admin.getUserById.mockResolvedValueOnce({
      data: {
        user: {
          id: TEST_USER_ID,
          email: null,
        },
      },
      error: null,
    })

    const request = createStripeWebhookRequest()
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)

    // Email should not be sent
    expect(mockSendSaleCreatedEmail).not.toHaveBeenCalled()
    expect(mockRecordEmailSend).not.toHaveBeenCalled()
  })

  it('should skip email if payment intent ID is missing', async () => {
    // Mock webhook event without payment intent ID
    mockStripe.webhooks.constructEvent.mockReturnValueOnce({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: null, // No payment intent ID
          metadata: {
            draft_key: TEST_DRAFT_KEY,
            wants_promotion: 'true',
          },
        },
      },
    })

    const request = createStripeWebhookRequest()
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)

    // Email should not be sent (payment intent ID required for dedupe key)
    expect(mockSendSaleCreatedEmail).not.toHaveBeenCalled()
    expect(mockRecordEmailSend).not.toHaveBeenCalled()
  })
})
