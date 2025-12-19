/**
 * Regression tests for promotion flow with drafts
 * 
 * Verifies enterprise-safe promotion flow:
 * - Draft-only state before payment
 * - Sale creation ONLY in Stripe webhook
 * - No destructive rollback on checkout failure
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as publishDraft } from '@/app/api/drafts/publish/route'
import { POST as checkoutHandler } from '@/app/api/promotions/checkout/route'
import type { SaleDraftPayload } from '@/lib/validation/saleDraft'

// Mock Supabase clients
const mockRlsDb = {
  from: vi.fn(),
}

const mockAdminDb = {
  from: vi.fn(),
}

const mockSupabaseServer = {
  auth: {
    getUser: vi.fn(),
  },
}

// Mock Stripe client
const mockStripeClient = {
  checkout: {
    sessions: {
      create: vi.fn(),
    },
  },
  prices: {
    retrieve: vi.fn(),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseServer,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
  getAdminDb: () => mockAdminDb,
  fromBase: (client: any, table: string) => client.from(table),
}))

vi.mock('@/lib/api/csrfCheck', () => ({
  checkCsrfIfRequired: async () => null,
}))

vi.mock('@/lib/auth/accountLock', () => ({
  assertAccountNotLocked: async () => {},
}))

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => mockStripeClient,
  isPaymentsEnabled: () => true,
  isPromotionsEnabled: () => true,
  getFeaturedWeekPriceId: () => 'price_test_123',
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Promotion Flow with Drafts', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  }

  const draftKey = 'draft-key-123'
  const draftId = 'draft-id-123'

  const draftPayload: SaleDraftPayload = {
    formData: {
      title: 'Test Sale',
      description: 'Test description',
      city: 'Test City',
      state: 'TS',
      date_start: '2025-12-25',
      time_start: '09:00',
      lat: 38.0,
      lng: -85.0,
    },
    photos: [],
    items: [],
    currentStep: 0,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup auth mock
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })

    // Setup default query builder factory
    const createQueryBuilder = () => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    })

    // Default: return a fresh builder for each call
    mockRlsDb.from.mockImplementation(() => createQueryBuilder())
    mockAdminDb.from.mockImplementation(() => createQueryBuilder())

    // Setup Stripe mocks
    mockStripeClient.prices.retrieve.mockResolvedValue({
      unit_amount: 1000, // $10.00
    })
  })

  describe('Draft Publish with wantsPromotion=true', () => {
    it('should create checkout session and NOT create sale or delete draft', async () => {
      // Setup: Draft exists
      const rlsQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: draftId,
            draft_key: draftKey,
            user_id: mockUser.id,
            status: 'active',
            payload: draftPayload,
          },
          error: null,
        }),
      }
      mockRlsDb.from.mockReturnValue(rlsQueryBuilder)

      // Setup: Promotion creation
      const promotionInsertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'promotion-id-123',
            sale_id: null,
            owner_profile_id: mockUser.id,
            status: 'pending',
          },
          error: null,
        }),
      }

      // Setup: Promotion update with checkout session
      const promotionUpdateBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }

      // Track calls to admin.from
      let promotionCallCount = 0
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'promotions') {
          promotionCallCount++
          if (promotionCallCount === 1) {
            // First call: insert
            return promotionInsertBuilder
          } else {
            // Subsequent calls: update
            return promotionUpdateBuilder
          }
        }
        // Return a default builder for other tables
        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(),
          maybeSingle: vi.fn(),
        }
      })

      // Setup: Stripe checkout session
      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
        customer: null,
        payment_intent: 'pi_test_123',
      })

      const request = new NextRequest('http://localhost/api/drafts/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftKey,
          wantsPromotion: true,
        }),
      })

      const response = await publishDraft(request)
      const result = await response.json()

      // Should return checkout URL, not sale ID
      expect(result.ok).toBe(true)
      expect(result.data?.checkoutUrl).toBe('https://checkout.stripe.com/test')
      expect(result.data?.sessionId).toBe('cs_test_123')
      expect(result.data?.promotionId).toBe('promotion-id-123')
      expect(result.data?.saleId).toBeUndefined()

      // Verify checkout session was created with draft_key in metadata
      expect(mockStripeClient.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            draft_key: draftKey,
            promotion_id: 'promotion-id-123',
          }),
        })
      )
      expect(mockStripeClient.checkout.sessions.create.mock.calls[0][0].metadata.sale_id).toBeUndefined()

      // Verify NO sale was created (check that 'sales' table was never accessed)
      const saleCalls = mockAdminDb.from.mock.calls.filter((call) => call[0] === 'sales')
      expect(saleCalls.length).toBe(0)

      // Verify draft was NOT deleted (check that 'sale_drafts' table was never accessed via admin)
      const draftDeleteCalls = mockAdminDb.from.mock.calls.filter((call) => call[0] === 'sale_drafts')
      expect(draftDeleteCalls.length).toBe(0)
    })

    it('should handle checkout session creation failure gracefully', async () => {
      // Setup: Draft exists
      const rlsQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: draftId,
            draft_key: draftKey,
            user_id: mockUser.id,
            status: 'active',
            payload: draftPayload,
          },
          error: null,
        }),
      }
      mockRlsDb.from.mockReturnValue(rlsQueryBuilder)

      // Setup: Promotion creation succeeds
      const promotionInsertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'promotion-id-123',
            sale_id: null,
            owner_profile_id: mockUser.id,
            status: 'pending',
          },
          error: null,
        }),
      }

      // Setup: Promotion cleanup (cancel promotion on failure)
      const promotionUpdateBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }

      // Setup: Stripe checkout session creation fails
      mockStripeClient.checkout.sessions.create.mockRejectedValue(
        new Error('Stripe API error')
      )

      // Setup admin.from to return different builders based on table and call order
      const promotionCalls: string[] = []
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'promotions') {
          promotionCalls.push('promotions')
          const callIndex = promotionCalls.length - 1
          if (callIndex === 0) {
            // First call: insert
            return promotionInsertBuilder
          } else {
            // Second call: update (cancel on failure)
            return promotionUpdateBuilder
          }
        }
        // Return a default builder for other tables
        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(),
          maybeSingle: vi.fn(),
        }
      })

      const request = new NextRequest('http://localhost/api/drafts/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftKey,
          wantsPromotion: true,
        }),
      })

      const response = await publishDraft(request)
      const result = await response.json()

      // Should return error
      expect(result.ok).toBe(false)
      expect(result.code).toBe('STRIPE_ERROR')

      // Verify promotion was canceled
      expect(promotionUpdateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled',
        })
      )

      // Verify NO sale was created (check that 'sales' table was never accessed)
      const saleCalls = mockAdminDb.from.mock.calls.filter((call) => call[0] === 'sales')
      expect(saleCalls.length).toBe(0)

      // Verify draft still exists (not deleted - check that 'sale_drafts' table was never accessed via admin)
      const draftDeleteCalls = mockAdminDb.from.mock.calls.filter((call) => call[0] === 'sale_drafts')
      expect(draftDeleteCalls.length).toBe(0)
    })
  })

  describe('Stripe Webhook - checkout.session.completed', () => {
    it('should create sale from draft_key and activate promotion', async () => {
      // This test would require importing the webhook handler
      // For now, we'll test the key logic separately
      // Full webhook test would require Stripe event signature verification mocks
    })

    it('should handle idempotency - skip sale creation if promotion already has sale_id', async () => {
      // This test verifies that webhook retries don't create duplicate sales
      // Would require webhook handler import and event processing
    })
  })

  describe('Non-promotion publish path unchanged', () => {
    it('should create sale immediately when wantsPromotion=false', async () => {
      // Setup: Draft exists
      const rlsQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: draftId,
            draft_key: draftKey,
            user_id: mockUser.id,
            status: 'active',
            payload: draftPayload,
          },
          error: null,
        }),
      }
      mockRlsDb.from.mockReturnValue(rlsQueryBuilder)

      // Setup: Sale creation
      const saleInsertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'sale-id-123',
            status: 'published',
          },
          error: null,
        }),
      }

      // Setup: Draft deletion
      const draftDeleteBuilder = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [{ id: draftId }],
        }),
      }

      // Setup admin.from to return different builders based on table
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return saleInsertBuilder
        } else if (table === 'sale_drafts') {
          return draftDeleteBuilder
        }
        // Return a default builder for other tables
        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(),
          maybeSingle: vi.fn(),
        }
      })

      const request = new NextRequest('http://localhost/api/drafts/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftKey,
          wantsPromotion: false,
        }),
      })

      const response = await publishDraft(request)
      const result = await response.json()

      // Should return sale ID
      expect(result.ok).toBe(true)
      expect(result.data?.saleId).toBe('sale-id-123')
      expect(result.data?.checkoutUrl).toBeUndefined()

      // Verify sale was created
      expect(adminQueryBuilder1.insert).toHaveBeenCalled()

      // Verify draft was deleted
      expect(adminQueryBuilder2.delete).toHaveBeenCalled()
    })
  })
})

