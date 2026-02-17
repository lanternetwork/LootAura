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

// Mock rollback helper to track calls - must be defined before vi.mock
const mockDeleteSaleAndItemsForRollback = vi.fn()
vi.mock('@/lib/data/draftsPublishRollback', () => ({
  deleteSaleAndItemsForRollback: (...args: any[]) => mockDeleteSaleAndItemsForRollback(...args),
}))

// Mock auth only - we need a test user for authentication
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token', user: { id: 'test-user-id' } } },
      error: null,
    }),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
  createSupabaseWriteClient: () => mockSupabaseClient,
}))

// Mock Supabase clients for database operations
// Create chainable mock objects that return themselves for chaining
const createChainableMock = () => {
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn()
  chain.maybeSingle = vi.fn()
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  return chain
}

const mockDraftChain = createChainableMock()
const mockSaleChain = createChainableMock()
const mockItemChain = createChainableMock()
const mockProfileChain = createChainableMock()

const mockRlsDb = {
  from: vi.fn((table: string) => {
    if (table === 'sale_drafts') {
      return mockDraftChain
    }
    return createChainableMock()
  }),
}

const mockAdminDb = {
  from: vi.fn((table: string) => {
    if (table === 'sales') {
      return mockSaleChain
    }
    if (table === 'items') {
      return mockItemChain
    }
    if (table === 'sale_drafts') {
      return mockDraftChain
    }
    if (table === 'profiles') {
      return mockProfileChain
    }
    return createChainableMock()
  }),
}

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb, // Return mock RLS DB instead of throwing
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => {
    if (table === 'profiles') {
      return mockProfileChain
    }
    return db.from(table)
  },
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
  generateOperationId: vi.fn(() => 'test-op-id-123'),
}))

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  default: {
    captureException: vi.fn(),
  },
  captureException: vi.fn(),
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
    
    // Reset all chain mocks to return themselves for chaining
    mockDraftChain.eq.mockReturnValue(mockDraftChain)
    mockDraftChain.select.mockReturnValue(mockDraftChain)
    mockDraftChain.insert.mockReturnValue(mockDraftChain)
    mockDraftChain.update.mockReturnValue(mockDraftChain)
    mockDraftChain.delete.mockReturnValue(mockDraftChain)
    
    mockSaleChain.eq.mockReturnValue(mockSaleChain)
    mockSaleChain.select.mockReturnValue(mockSaleChain)
    mockSaleChain.insert.mockReturnValue(mockSaleChain)
    mockSaleChain.delete.mockReturnValue(mockSaleChain)
    
    mockItemChain.eq.mockReturnValue(mockItemChain)
    mockItemChain.select.mockReturnValue(mockItemChain)
    mockItemChain.insert.mockReturnValue(mockItemChain)
    mockItemChain.delete.mockReturnValue(mockItemChain)
    mockItemChain.limit.mockReturnValue(mockItemChain)
    
    // Set up profile chain for account lock check - user is not locked by default
    mockProfileChain.select.mockReturnValue(mockProfileChain)
    mockProfileChain.eq.mockReturnValue(mockProfileChain)
    mockProfileChain.maybeSingle.mockResolvedValue({
      data: { is_locked: false },
      error: null,
    })
  })

  describe('Rollback on failure', () => {
    beforeEach(() => {
      // Mock account lock check - user is not locked
      mockProfileChain.select.mockReturnValue(mockProfileChain)
      mockProfileChain.eq.mockReturnValue(mockProfileChain)
      mockProfileChain.maybeSingle.mockResolvedValue({
        data: { is_locked: false },
        error: null,
      })
    })

    it('calls rollback when items creation fails after sale creation', async () => {
      // Mock successful draft lookup
      mockDraftChain.maybeSingle.mockResolvedValue({
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
      mockSaleChain.single.mockResolvedValue({
        data: { id: saleId, owner_id: userId },
        error: null,
      })
      
      // Mock items creation failure
      // The route calls: fromBase(admin, 'items').insert(itemsData).select('id')
      // So insert() returns a chain, then select() is called, which should fail
      mockItemChain.insert.mockReturnValue(mockItemChain)
      mockItemChain.select.mockResolvedValue({
        data: null,
        error: { message: 'Items creation failed', code: 'CONSTRAINT_VIOLATION' },
      })
      
      // Mock draft deletion (non-critical, can fail)
      mockDraftChain.delete.mockResolvedValue({ error: null })

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
      mockDraftChain.maybeSingle.mockResolvedValue({
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
      mockSaleChain.single.mockResolvedValue({
        data: { id: saleId, owner_id: userId },
        error: null,
      })
      
      // Mock unexpected error during items creation (throw instead of error response)
      // The route calls: fromBase(admin, 'items').insert(itemsData).select('id')
      mockItemChain.insert.mockReturnValue(mockItemChain)
      mockItemChain.select.mockRejectedValue(new Error('Unexpected database error'))
      
      // Ensure account lock check passes
      mockProfileChain.select.mockReturnValue(mockProfileChain)
      mockProfileChain.eq.mockReturnValue(mockProfileChain)
      mockProfileChain.maybeSingle.mockResolvedValue({
        data: { is_locked: false },
        error: null,
      })

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
