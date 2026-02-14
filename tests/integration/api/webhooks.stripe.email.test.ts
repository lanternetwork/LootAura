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

    // CRITICAL: Set up stripe_webhook_events mock FIRST before any other mocks
    // The webhook handler calls fromBase(admin, 'stripe_webhook_events').insert() at the very start
    // This must be set up before vi.clearAllMocks() or immediately after to ensure it's available
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'stripe_webhook_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnThis(),
        }
      }
      // Default fallback (will be overridden below for specific tables)
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
      }
    })

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
    // CRITICAL: Must include stripe_webhook_events because webhook handler calls it first
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'stripe_webhook_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnThis(),
        }
      }
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
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
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
    // Gate condition 1: Webhook event not already processed (no early return)
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
      // Default fallback for other tables
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
      }
    })

    // Gate condition 2: Draft exists (no early return due to "draft not found")
    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'sale_drafts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockDraft, error: null }), // Draft found
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    // Gate condition 3: No existing promotion (draft exists, so this check won't run, but set up for safety)
    // This is handled by the promotions mock below returning null for maybeSingle

    // Gate condition 4: Admin DB for sale creation and promotion
    let salesCallCount = 0
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'stripe_webhook_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnThis(),
        }
      }
      if (table === 'sales') {
        const salesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            salesCallCount++
            if (salesCallCount === 1) {
              // First call: sale creation returns just ID (from insert().select().single())
              return Promise.resolve({ data: { id: TEST_SALE_ID }, error: null })
            }
            // Subsequent calls: sale fetch for email returns full published sale data (from select().eq().single())
            return Promise.resolve({ data: mockSaleData, error: null })
          }),
        }
        return {
          insert: vi.fn().mockReturnValue(salesChain), // insert() returns chainable object with select()
          ...salesChain,
        }
      }
      if (table === 'items') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      if (table === 'promotions') {
        const promotionsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: TEST_PROMOTION_ID },
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // No existing promotion
        }
        return {
          insert: vi.fn().mockReturnValue(promotionsChain), // insert() returns chainable object with select()
          ...promotionsChain,
        }
      }
      if (table === 'sale_drafts') {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }
      // Default fallback
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
      }
    })

    // Gate condition 5: Valid paymentIntentId and user email are present
    // paymentIntentId comes from webhook event metadata (already in createStripeWebhookRequest)
    // User email comes from Admin API
    mockAdminBase.auth.admin.getUserById.mockResolvedValueOnce({
      data: {
        user: {
          id: TEST_USER_ID,
          email: TEST_USER_EMAIL,
        },
      },
      error: null,
    })

    // Gate condition 6: canSendEmail() returns true (email not already sent)
    // Explicitly mock and track calls
    mockCanSendEmail.mockClear()
    mockCanSendEmail.mockResolvedValueOnce(true)

    // Gate condition 7: sendSaleCreatedEmail() fails
    // Explicitly mock and track calls
    mockSendSaleCreatedEmail.mockClear()
    mockSendSaleCreatedEmail.mockResolvedValueOnce({
      ok: false,
      error: 'Resend API error',
    })

    // Clear recordEmailSend to track calls
    mockRecordEmailSend.mockClear()

    // Track DB calls to diagnose early returns
    const stripeWebhookEventsSelect = vi.fn().mockReturnThis()
    const stripeWebhookEventsEq = vi.fn().mockReturnThis()
    const stripeWebhookEventsMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const stripeWebhookEventsInsert = vi.fn().mockResolvedValue({ data: null, error: null })

    const saleDraftsSelect = vi.fn().mockReturnThis()
    const saleDraftsEq = vi.fn().mockReturnThis()
    const saleDraftsMaybeSingle = vi.fn().mockResolvedValue({ data: mockDraft, error: null })

    const salesInsert = vi.fn()
    const salesSelect = vi.fn().mockReturnThis()
    const salesEq = vi.fn().mockReturnThis()

    // Update mocks to use tracked functions
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'stripe_webhook_events') {
        return {
          select: stripeWebhookEventsSelect,
          eq: stripeWebhookEventsEq,
          maybeSingle: stripeWebhookEventsMaybeSingle,
          insert: stripeWebhookEventsInsert,
          update: vi.fn().mockReturnThis(),
        }
      }
      if (table === 'sales') {
        const salesChain = {
          select: salesSelect,
          eq: salesEq,
          single: vi.fn().mockImplementation(() => {
            salesCallCount++
            if (salesCallCount === 1) {
              return Promise.resolve({ data: { id: TEST_SALE_ID }, error: null })
            }
            return Promise.resolve({ data: mockSaleData, error: null })
          }),
        }
        return {
          insert: salesInsert.mockReturnValue(salesChain),
          ...salesChain,
        }
      }
      if (table === 'items') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      if (table === 'promotions') {
        const promotionsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: TEST_PROMOTION_ID },
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        return {
          insert: vi.fn().mockReturnValue(promotionsChain),
          ...promotionsChain,
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
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
      }
    })

    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'sale_drafts') {
        return {
          select: saleDraftsSelect,
          eq: saleDraftsEq,
          maybeSingle: saleDraftsMaybeSingle,
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    const request = createStripeWebhookRequest()
    const response = await POST(request)
    const data = await response.json()

    // Assert: Webhook still returns success (2xx)
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)

    // Diagnostic assertions: Check if we reached the email block
    const canSendEmailCallCount = mockCanSendEmail.mock.calls.length
    const sendSaleCreatedEmailCallCount = mockSendSaleCreatedEmail.mock.calls.length
    const recordEmailSendCallCount = mockRecordEmailSend.mock.calls.length

    // Assert: canSendEmail was called (proves we reached the email block)
    expect(canSendEmailCallCount).toBeGreaterThan(0)
    if (canSendEmailCallCount > 0) {
      expect(mockCanSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: TEST_USER_ID,
          emailType: 'sale_created_confirmation',
          dedupeKey: `sale_created_promotion:${TEST_PAYMENT_INTENT_ID}`,
        })
      )
      const canSendResult = await mockCanSendEmail.mock.results[0].value
      expect(canSendResult).toBe(true)
    }

    // Assert: sendSaleCreatedEmail was called once (proves we attempted to send)
    expect(sendSaleCreatedEmailCallCount).toBe(1)
    if (sendSaleCreatedEmailCallCount > 0) {
      expect(mockSendSaleCreatedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          sale: expect.objectContaining({
            id: TEST_SALE_ID,
            status: 'published',
          }),
          owner: {
            email: TEST_USER_EMAIL,
          },
          isFeatured: true,
          dedupeKey: `sale_created_promotion:${TEST_PAYMENT_INTENT_ID}`,
        })
      )
    }

    // If email functions weren't called, diagnose which earlier branch was taken
    if (canSendEmailCallCount === 0 || sendSaleCreatedEmailCallCount === 0) {
      // Check if webhook event was already processed (early return)
      expect(stripeWebhookEventsMaybeSingle).toHaveBeenCalled()
      
      // Check if draft lookup happened
      expect(saleDraftsSelect).toHaveBeenCalled()
      expect(saleDraftsMaybeSingle).toHaveBeenCalled()
      
      // Check if sale creation happened
      expect(salesInsert).toHaveBeenCalled()
      
      // If we got here but email wasn't called, something blocked the email path
      throw new Error(
        `Email block not reached. canSendEmail calls: ${canSendEmailCallCount}, ` +
        `sendSaleCreatedEmail calls: ${sendSaleCreatedEmailCallCount}. ` +
        `Check if paymentIntentId, user email, or env vars are missing.`
      )
    }

    // Assert: recordEmailSend is called once with deliveryStatus: 'failed'
    expect(recordEmailSendCallCount).toBe(1)
    expect(mockRecordEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: TEST_USER_ID,
        emailType: 'sale_created_confirmation',
        toEmail: TEST_USER_EMAIL,
        dedupeKey: `sale_created_promotion:${TEST_PAYMENT_INTENT_ID}`,
        deliveryStatus: 'failed',
        errorMessage: 'Email send failed', // Fixed non-sensitive error message (no raw exception)
        subject: 'Your yard sale is live on LootAura 🚀',
        meta: expect.objectContaining({
          saleId: TEST_SALE_ID,
          promotionId: TEST_PROMOTION_ID,
          paymentIntentId: TEST_PAYMENT_INTENT_ID,
          isFeatured: true,
        }),
      })
    )

    // Explicitly verify deliveryStatus is 'failed' and not 'sent'
    const recordCall = mockRecordEmailSend.mock.calls[0]
    expect(recordCall[0].deliveryStatus).toBe('failed')
    expect(recordCall[0].deliveryStatus).not.toBe('sent')
    expect(recordCall[0].errorMessage).toBe('Email send failed')
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
