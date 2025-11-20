/**
 * Integration tests for draft publish rollback/compensation logic
 * Tests that draft publish properly cleans up partial state on failure
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'
import { SaleDraftPayloadSchema } from '@/lib/validation/saleDraft'

// Mock rollback helper to track calls
const mockDeleteSaleAndItemsForRollback = vi.fn().mockResolvedValue(true)

vi.mock('@/lib/data/draftsPublishRollback', () => ({
  deleteSaleAndItemsForRollback: mockDeleteSaleAndItemsForRollback,
}))

// Mock Supabase clients
const mockRlsDb = {
  from: vi.fn(),
}

const mockAdminDb = {
  from: vi.fn(),
}

const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
  },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => {
    if (table.includes('.')) {
      throw new Error(`Do not qualify table names: received "${table}"`)
    }
    return db.from(table)
  },
}))

// Mock image validation
vi.mock('@/lib/images/validateImageUrl', () => ({
  isAllowedImageUrl: vi.fn().mockReturnValue(true),
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  default: {
    captureException: vi.fn(),
  },
}))

// Mock job enqueueing (non-critical, should not affect rollback)
vi.mock('@/lib/jobs', () => ({
  enqueueJob: vi.fn().mockResolvedValue(undefined),
  JOB_TYPES: {
    IMAGE_POSTPROCESS: 'IMAGE_POSTPROCESS',
  },
}))

// Mock business events
vi.mock('@/lib/events/businessEvents', () => ({
  logDraftPublished: vi.fn(),
}))

// Mock env
vi.mock('@/lib/env', () => ({
  isDebugMode: vi.fn().mockReturnValue(false),
  isProduction: vi.fn().mockReturnValue(false),
}))

let POST: any
beforeAll(async () => {
  const route = await import('@/app/api/drafts/publish/route')
  POST = route.POST
})

// Helper to create a request with CSRF token
function createRequestWithCsrf(url: string, body: any): NextRequest {
  const csrfToken = generateCsrfToken()
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      'cookie': `csrf-token=${csrfToken}`,
    },
  })
}

// Helper to create a mock draft payload
function createMockDraftPayload() {
  return {
    formData: {
      title: 'Test Sale',
      description: 'Test description',
      address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345',
      lat: 40.7128,
      lng: -74.0060,
      date_start: '2025-12-01',
      time_start: '09:00',
      date_end: '2025-12-01',
      time_end: '17:00',
      pricing_mode: 'negotiable' as const,
    },
    photos: [],
    items: [
      {
        name: 'Test Item',
        price: 10,
        description: 'Test item description',
        category: 'tools' as const,
      },
    ],
  }
}

describe('Draft Publish Rollback', () => {
  const userId = 'test-user-id'
  const draftKey = 'test-draft-key'
  const draftId = 'test-draft-id'
  const saleId = 'test-sale-id'

  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteSaleAndItemsForRollback.mockResolvedValue(true)
    
    // Reset auth
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })
  })

  describe('Happy path baseline', () => {
    it('publishes draft successfully when all steps succeed', async () => {
      const draftPayload = createMockDraftPayload()
      const validatedPayload = SaleDraftPayloadSchema.parse(draftPayload)

      // Mock draft lookup
      const mockDraftSelect = vi.fn().mockReturnThis()
      const mockDraftEq = vi.fn().mockReturnThis()
      const mockDraftMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: draftId,
          draft_key: draftKey,
          user_id: userId,
          status: 'active',
          payload: validatedPayload,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue({
        select: mockDraftSelect,
        eq: mockDraftEq,
        maybeSingle: mockDraftMaybeSingle,
      })
      mockDraftSelect.mockReturnValue({
        eq: mockDraftEq,
      })
      mockDraftEq.mockReturnValue({
        maybeSingle: mockDraftMaybeSingle,
      })

      // Mock sale creation
      const mockSaleInsert = vi.fn().mockReturnThis()
      const mockSaleSelect = vi.fn().mockReturnThis()
      const mockSaleSingle = vi.fn().mockResolvedValue({
        data: { id: saleId },
        error: null,
      })

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            insert: mockSaleInsert,
          }
        }
        if (table === 'items') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
          }
        }
        if (table === 'sale_drafts') {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({
              data: [{ id: draftId }],
              error: null,
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      })

      mockSaleInsert.mockReturnValue({
        select: mockSaleSelect,
      })
      mockSaleSelect.mockReturnValue({
        single: mockSaleSingle,
      })

      // Mock items creation
      const mockItemsInsert = vi.fn().mockReturnThis()
      const mockItemsSelect = vi.fn().mockReturnThis()
      const mockItemsSelectResult = vi.fn().mockResolvedValue({
        data: [{ id: 'item-1', name: 'Test Item', sale_id: saleId }],
        error: null,
      })

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            insert: mockSaleInsert,
          }
        }
        if (table === 'items') {
          return {
            insert: mockItemsInsert,
            select: mockItemsSelect,
          }
        }
        if (table === 'sale_drafts') {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({
              data: [{ id: draftId }],
              error: null,
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      })

      mockItemsInsert.mockReturnValue({
        select: mockItemsSelect,
      })
      mockItemsSelect.mockReturnValue(mockItemsSelectResult)

      const request = createRequestWithCsrf('http://localhost/api/drafts/publish', {
        draftKey,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.saleId).toBe(saleId)
      
      // Verify rollback was NOT called (successful publish)
      expect(mockDeleteSaleAndItemsForRollback).not.toHaveBeenCalled()
    })
  })

  describe('Rollback on items creation failure', () => {
    it('rolls back sale if items creation fails', async () => {
      const draftPayload = createMockDraftPayload()
      const validatedPayload = SaleDraftPayloadSchema.parse(draftPayload)

      // Mock draft lookup
      const mockDraftSelect = vi.fn().mockReturnThis()
      const mockDraftEq = vi.fn().mockReturnThis()
      const mockDraftMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: draftId,
          draft_key: draftKey,
          user_id: userId,
          status: 'active',
          payload: validatedPayload,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue({
        select: mockDraftSelect,
        eq: mockDraftEq,
        maybeSingle: mockDraftMaybeSingle,
      })
      mockDraftSelect.mockReturnValue({
        eq: mockDraftEq,
      })
      mockDraftEq.mockReturnValue({
        maybeSingle: mockDraftMaybeSingle,
      })

      // Mock sale creation (succeeds)
      const mockSaleInsert = vi.fn().mockReturnThis()
      const mockSaleSelect = vi.fn().mockReturnThis()
      const mockSaleSingle = vi.fn().mockResolvedValue({
        data: { id: saleId },
        error: null,
      })

      // Mock items creation (fails)
      const mockItemsInsert = vi.fn().mockReturnThis()
      const mockItemsSelect = vi.fn().mockReturnThis()
      const mockItemsSelectResult = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'Foreign key constraint violation',
        },
      })

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            insert: mockSaleInsert,
          }
        }
        if (table === 'items') {
          return {
            insert: mockItemsInsert,
            select: mockItemsSelect,
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      })

      mockSaleInsert.mockReturnValue({
        select: mockSaleSelect,
      })
      mockSaleSelect.mockReturnValue({
        single: mockSaleSingle,
      })

      mockItemsInsert.mockReturnValue({
        select: mockItemsSelect,
      })
      mockItemsSelect.mockReturnValue(mockItemsSelectResult)

      const request = createRequestWithCsrf('http://localhost/api/drafts/publish', {
        draftKey,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('ITEMS_CREATE_FAILED')
      
      // Verify rollback was called with the created sale ID
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledTimes(1)
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledWith(
        expect.anything(), // admin client
        saleId
      )
    })
  })

  describe('Rollback on unexpected errors', () => {
    it('handles partial failure and cleans up created sale/items in catch block', async () => {
      const draftPayload = createMockDraftPayload()
      const validatedPayload = SaleDraftPayloadSchema.parse(draftPayload)

      // Mock draft lookup
      const mockDraftSelect = vi.fn().mockReturnThis()
      const mockDraftEq = vi.fn().mockReturnThis()
      const mockDraftMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: draftId,
          draft_key: draftKey,
          user_id: userId,
          status: 'active',
          payload: validatedPayload,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue({
        select: mockDraftSelect,
        eq: mockDraftEq,
        maybeSingle: mockDraftMaybeSingle,
      })
      mockDraftSelect.mockReturnValue({
        eq: mockDraftEq,
      })
      mockDraftEq.mockReturnValue({
        maybeSingle: mockDraftMaybeSingle,
      })

      // Mock sale creation (succeeds)
      const mockSaleInsert = vi.fn().mockReturnThis()
      const mockSaleSelect = vi.fn().mockReturnThis()
      const mockSaleSingle = vi.fn().mockResolvedValue({
        data: { id: saleId },
        error: null,
      })

      // Mock items creation (succeeds)
      const mockItemsInsert = vi.fn().mockReturnThis()
      const mockItemsSelect = vi.fn().mockReturnThis()
      const mockItemsSelectResult = vi.fn().mockResolvedValue({
        data: [{ id: 'item-1', name: 'Test Item', sale_id: saleId }],
        error: null,
      })

      // Mock draft deletion (fails with unexpected error)
      const mockDraftDelete = vi.fn().mockReturnThis()
      const mockDraftDeleteEq = vi.fn().mockReturnThis()
      const mockDraftDeleteSelect = vi.fn().mockImplementation(() => {
        throw new Error('Unexpected database error during draft deletion')
      })

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            insert: mockSaleInsert,
          }
        }
        if (table === 'items') {
          return {
            insert: mockItemsInsert,
            select: mockItemsSelect,
          }
        }
        if (table === 'sale_drafts') {
          return {
            delete: mockDraftDelete,
            eq: mockDraftDeleteEq,
            select: mockDraftDeleteSelect,
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      })

      mockSaleInsert.mockReturnValue({
        select: mockSaleSelect,
      })
      mockSaleSelect.mockReturnValue({
        single: mockSaleSingle,
      })

      mockItemsInsert.mockReturnValue({
        select: mockItemsSelect,
      })
      mockItemsSelect.mockReturnValue(mockItemsSelectResult)

      mockDraftDelete.mockReturnValue({
        eq: mockDraftDeleteEq,
      })
      mockDraftDeleteEq.mockReturnValue({
        select: mockDraftDeleteSelect,
      })

      const request = createRequestWithCsrf('http://localhost/api/drafts/publish', {
        draftKey,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('PUBLISH_FAILED')
      
      // Verify rollback was called in catch block
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledTimes(1)
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledWith(
        expect.anything(), // admin client
        saleId
      )
    })

    it('handles rollback errors gracefully without masking original error', async () => {
      const draftPayload = createMockDraftPayload()
      const validatedPayload = SaleDraftPayloadSchema.parse(draftPayload)

      // Mock rollback to fail
      mockDeleteSaleAndItemsForRollback.mockResolvedValue(false)

      // Mock draft lookup
      const mockDraftSelect = vi.fn().mockReturnThis()
      const mockDraftEq = vi.fn().mockReturnThis()
      const mockDraftMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: draftId,
          draft_key: draftKey,
          user_id: userId,
          status: 'active',
          payload: validatedPayload,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue({
        select: mockDraftSelect,
        eq: mockDraftEq,
        maybeSingle: mockDraftMaybeSingle,
      })
      mockDraftSelect.mockReturnValue({
        eq: mockDraftEq,
      })
      mockDraftEq.mockReturnValue({
        maybeSingle: mockDraftMaybeSingle,
      })

      // Mock sale creation (succeeds)
      const mockSaleInsert = vi.fn().mockReturnThis()
      const mockSaleSelect = vi.fn().mockReturnThis()
      const mockSaleSingle = vi.fn().mockResolvedValue({
        data: { id: saleId },
        error: null,
      })

      // Mock items creation (fails)
      const mockItemsInsert = vi.fn().mockReturnThis()
      const mockItemsSelect = vi.fn().mockReturnThis()
      const mockItemsSelectResult = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'Foreign key constraint violation',
        },
      })

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            insert: mockSaleInsert,
          }
        }
        if (table === 'items') {
          return {
            insert: mockItemsInsert,
            select: mockItemsSelect,
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      })

      mockSaleInsert.mockReturnValue({
        select: mockSaleSelect,
      })
      mockSaleSelect.mockReturnValue({
        single: mockSaleSingle,
      })

      mockItemsInsert.mockReturnValue({
        select: mockItemsSelect,
      })
      mockItemsSelect.mockReturnValue(mockItemsSelectResult)

      const request = createRequestWithCsrf('http://localhost/api/drafts/publish', {
        draftKey,
      })

      const response = await POST(request)
      const data = await response.json()

      // Original error should still be returned (not masked by rollback failure)
      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('ITEMS_CREATE_FAILED')
      
      // Verify rollback was attempted (even if it failed)
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledTimes(1)
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledWith(
        expect.anything(),
        saleId
      )
    })
  })
})

