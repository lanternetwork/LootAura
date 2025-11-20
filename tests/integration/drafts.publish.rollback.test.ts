/**
 * Integration tests for draft publish rollback/compensation logic
 * Tests that draft publish properly cleans up partial state on failure
 * 
 * These tests use the real API route and real Supabase client to verify
 * that rollback logic prevents orphaned sales and items.
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'
import { SaleDraftPayloadSchema } from '@/lib/validation/saleDraft'
import { deleteSaleAndItemsForRollback } from '@/lib/data/draftsPublishRollback'

// Mock auth only - we need a test user for authentication
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

// Mock Supabase clients for database operations
const mockDraftSelect = vi.fn()
const mockDraftEq = vi.fn()
const mockDraftMaybeSingle = vi.fn()
const mockDraftUpdate = vi.fn()
const mockDraftDelete = vi.fn()

const mockSaleInsert = vi.fn()
const mockSaleSelect = vi.fn()
const mockSaleEq = vi.fn()
const mockSaleSingle = vi.fn()

const mockItemInsert = vi.fn()
const mockItemSelect = vi.fn()
const mockItemEq = vi.fn()
const mockItemLimit = vi.fn()

const mockRlsDb = {
  from: vi.fn((table: string) => {
    if (table === 'sale_drafts') {
      return {
        select: mockDraftSelect,
        update: mockDraftUpdate,
        delete: mockDraftDelete,
      }
    }
    return { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  }),
}

const mockAdminDb = {
  from: vi.fn((table: string) => {
    if (table === 'sales') {
      return {
        insert: mockSaleInsert,
        select: mockSaleSelect,
        delete: vi.fn(),
      }
    }
    if (table === 'items') {
      return {
        insert: mockItemInsert,
        select: mockItemSelect,
        delete: vi.fn(),
      }
    }
    if (table === 'sale_drafts') {
      return {
        update: mockDraftUpdate,
        delete: mockDraftDelete,
      }
    }
    return { select: vi.fn(), eq: vi.fn(), delete: vi.fn() }
  }),
}

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => db.from(table),
}))

// Mock rollback helper to track calls
const mockDeleteSaleAndItemsForRollback = vi.fn(deleteSaleAndItemsForRollback)
vi.mock('@/lib/data/draftsPublishRollback', () => ({
  deleteSaleAndItemsForRollback: mockDeleteSaleAndItemsForRollback,
}))

// Mock image validation - allow all URLs in tests
vi.mock('@/lib/images/validateImageUrl', () => ({
  isAllowedImageUrl: vi.fn().mockReturnValue(true),
}))

// Mock logger to avoid console noise
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

// Mock job enqueueing (non-critical)
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
  } as any)
}

// Helper to create a draft payload
function createDraftPayload() {
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
        id: 'item-1',
        name: 'Test Item',
        price: 10,
        description: 'Test item description',
        category: 'tools' as const,
      },
    ],
  }
}


describe('Draft publish rollback', () => {
  const userId = 'test-user-id'
  const draftId = 'test-draft-id'
  const saleId = 'test-sale-id'

  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteSaleAndItemsForRollback.mockClear()
    
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })
    
    // Setup draft lookup chain
    mockDraftSelect.mockReturnValue({
      eq: mockDraftEq,
    })
    mockDraftEq.mockReturnValue({
      maybeSingle: mockDraftMaybeSingle,
    })
    
    // Setup sale creation chain
    mockSaleInsert.mockReturnValue({
      select: mockSaleSelect,
    })
    mockSaleSelect.mockReturnValue({
      single: mockSaleSingle,
    })
    
    // Setup item creation chain
    mockItemInsert.mockReturnValue({
      select: mockItemSelect,
    })
    mockItemSelect.mockReturnValue({
      eq: mockItemEq,
    })
    mockItemEq.mockReturnValue({
      limit: mockItemLimit,
    })
  })

  describe('Rollback on failure', () => {
    it('calls rollback when items creation fails after sale creation', async () => {
      // Mock successful draft lookup
      mockDraftMaybeSingle.mockResolvedValue({
        data: {
          id: draftId,
          draft_key: 'test-draft-key',
          user_id: userId,
          status: 'active',
          payload: createDraftPayload(),
        },
        error: null,
      })
      
      // Mock successful sale creation
      mockSaleSingle.mockResolvedValue({
        data: { id: saleId, owner_id: userId },
        error: null,
      })
      
      // Mock items creation failure
      mockItemLimit.mockResolvedValue({
        data: null,
        error: { message: 'Items creation failed', code: 'CONSTRAINT_VIOLATION' },
      })
      
      // Mock draft deletion (non-critical, can fail)
      mockDraftDelete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })

      // Call the publish endpoint
      const request = createRequestWithCsrf('http://localhost/api/drafts/publish', {
        draftKey: 'test-draft-key',
      })

      const response = await POST(request)
      const data = await response.json()

      // Publish should fail
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('ITEMS_CREATE_FAILED')

      // Verify rollback was called with the created sale ID
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledTimes(1)
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledWith(
        mockAdminDb,
        saleId
      )
    })

    it('calls rollback on unexpected errors during publish', async () => {
      // Mock successful draft lookup
      mockDraftMaybeSingle.mockResolvedValue({
        data: {
          id: draftId,
          draft_key: 'test-draft-key-2',
          user_id: userId,
          status: 'active',
          payload: createDraftPayload(),
        },
        error: null,
      })
      
      // Mock successful sale creation
      mockSaleSingle.mockResolvedValue({
        data: { id: saleId, owner_id: userId },
        error: null,
      })
      
      // Mock unexpected error during items creation (throw instead of error response)
      mockItemLimit.mockRejectedValue(new Error('Unexpected database error'))

      // Call the publish endpoint
      const request = createRequestWithCsrf('http://localhost/api/drafts/publish', {
        draftKey: 'test-draft-key-2',
      })

      const response = await POST(request)
      const data = await response.json()

      // Publish should fail
      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('PUBLISH_FAILED')

      // Verify rollback was called
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledTimes(1)
      expect(mockDeleteSaleAndItemsForRollback).toHaveBeenCalledWith(
        mockAdminDb,
        saleId
      )
    })
  })
})
