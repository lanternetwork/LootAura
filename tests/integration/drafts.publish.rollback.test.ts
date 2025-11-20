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

// Helper to create a chainable mock query builder
function createChainableQueryBuilder() {
  const chain: any = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    gt: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    lte: vi.fn(),
    like: vi.fn(),
    ilike: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    contains: vi.fn(),
    containedBy: vi.fn(),
    rangeGt: vi.fn(),
    rangeGte: vi.fn(),
    rangeLt: vi.fn(),
    rangeLte: vi.fn(),
    rangeAdjacent: vi.fn(),
    overlaps: vi.fn(),
    textSearch: vi.fn(),
    match: vi.fn(),
    not: vi.fn(),
    or: vi.fn(),
    filter: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    range: vi.fn(),
    abortSignal: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    csv: vi.fn().mockResolvedValue(''),
    geojson: vi.fn().mockResolvedValue({}),
    explain: vi.fn().mockResolvedValue({}),
    rollback: vi.fn(),
    returns: vi.fn(),
  }
  
  // Make all chainable methods return the chain object itself
  const chainableMethods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 'rangeAdjacent', 'overlaps', 'textSearch', 'match', 'not', 'or', 'filter', 'order', 'limit', 'range', 'abortSignal', 'rollback', 'returns']
  chainableMethods.forEach(method => {
    chain[method].mockReturnValue(chain)
  })
  
  return chain
}

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
    const result = db.from(table)
    // Ensure the result is chainable (has all query builder methods)
    if (result && typeof result === 'object') {
      // If it already has chainable methods, return as-is
      if (result.eq && typeof result.eq === 'function') {
        return result
      }
    }
    // Fallback: return a chainable mock if db.from doesn't return proper chain
    return createChainableQueryBuilder()
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
  } as any)
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
        id: 'item-1',
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
    
    // Reset mock implementations
    mockRlsDb.from.mockReset()
    mockAdminDb.from.mockReset()
  })

  describe('Happy path baseline', () => {
    it('publishes draft successfully when all steps succeed', async () => {
      const draftPayload = createMockDraftPayload()
      const validatedPayload = SaleDraftPayloadSchema.parse(draftPayload)

      // Mock draft lookup - needs to support .select().eq().eq().maybeSingle() chain
      const draftChain = createChainableQueryBuilder()
      draftChain.maybeSingle.mockResolvedValue({
        data: {
          id: draftId,
          draft_key: draftKey,
          user_id: userId,
          status: 'active',
          payload: validatedPayload,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue(draftChain)

      // Mock sale creation
      const saleInsertChain = createChainableQueryBuilder()
      saleInsertChain.single.mockResolvedValue({
        data: { id: saleId },
        error: null,
      })

      // Mock draft deletion - needs to support:
      // 1. .delete().eq().eq().eq().eq().select() - for deletion (returns count)
      // 2. .select().eq().maybeSingle() - for verification (returns null if deleted)
      // Since fromBase is called twice for sale_drafts, we need to return different chains
      let saleDraftsCallCount = 0
      const draftDeleteChain = createChainableQueryBuilder()
      draftDeleteChain.select.mockResolvedValue({
        data: [{ id: draftId }],
        error: null,
        count: 1,
      })
      
      const draftVerificationChain = createChainableQueryBuilder()
      // The createChainableQueryBuilder() already sets up .select() and .eq() to return the chain
      // But we need to ensure they're explicitly set to return this specific chain object
      // Override with explicit return value to ensure chaining works
      draftVerificationChain.select.mockReturnValue(draftVerificationChain)
      draftVerificationChain.eq.mockReturnValue(draftVerificationChain)
      draftVerificationChain.maybeSingle.mockResolvedValue({
        data: null, // Draft deleted successfully
        error: null,
      })

      // Mock items creation
      const itemsInsertChain = createChainableQueryBuilder()
      itemsInsertChain.select.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Test Item', sale_id: saleId }],
        error: null,
      })

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return saleInsertChain
        }
        if (table === 'items') {
          return itemsInsertChain
        }
        if (table === 'sale_drafts') {
          saleDraftsCallCount++
          // First call is for deletion, second is for verification
          return saleDraftsCallCount === 1 ? draftDeleteChain : draftVerificationChain
        }
        return createChainableQueryBuilder()
      })

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

      // Mock draft lookup - needs to support .select().eq().eq().maybeSingle() chain
      const draftChain = createChainableQueryBuilder()
      draftChain.maybeSingle.mockResolvedValue({
        data: {
          id: draftId,
          draft_key: draftKey,
          user_id: userId,
          status: 'active',
          payload: validatedPayload,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue(draftChain)

      // Mock sale creation (succeeds)
      const saleInsertChain = createChainableQueryBuilder()
      saleInsertChain.single.mockResolvedValue({
        data: { id: saleId },
        error: null,
      })

      // Mock items creation (fails)
      const itemsInsertChain = createChainableQueryBuilder()
      itemsInsertChain.select.mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'Foreign key constraint violation',
        },
      })

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return saleInsertChain
        }
        if (table === 'items') {
          return itemsInsertChain
        }
        return createChainableQueryBuilder()
      })

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

      // Mock draft lookup - needs to support .select().eq().eq().maybeSingle() chain
      const draftChain = createChainableQueryBuilder()
      draftChain.maybeSingle.mockResolvedValue({
        data: {
          id: draftId,
          draft_key: draftKey,
          user_id: userId,
          status: 'active',
          payload: validatedPayload,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue(draftChain)

      // Mock sale creation (succeeds)
      const saleInsertChain = createChainableQueryBuilder()
      saleInsertChain.single.mockResolvedValue({
        data: { id: saleId },
        error: null,
      })

      // Mock items creation (succeeds)
      const itemsInsertChain = createChainableQueryBuilder()
      itemsInsertChain.select.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Test Item', sale_id: saleId }],
        error: null,
      })

      // Mock draft deletion (fails with unexpected error)
      // The error happens during the verification step, so we need to handle both chains
      let saleDraftsCallCount = 0
      const draftDeleteChain = createChainableQueryBuilder()
      draftDeleteChain.select.mockResolvedValue({
        data: [{ id: draftId }],
        error: null,
        count: 1,
      })
      
      const draftVerificationChain = createChainableQueryBuilder()
      // The createChainableQueryBuilder() already sets up .select() and .eq() to return the chain
      // But we need to ensure they're explicitly set to return this specific chain object
      // Override with explicit return value to ensure chaining works
      draftVerificationChain.select.mockReturnValue(draftVerificationChain)
      draftVerificationChain.eq.mockReturnValue(draftVerificationChain)
      // The error happens when trying to verify - throw in maybeSingle
      draftVerificationChain.maybeSingle.mockImplementation(() => {
        throw new Error('Unexpected database error during draft deletion')
      })

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return saleInsertChain
        }
        if (table === 'items') {
          return itemsInsertChain
        }
        if (table === 'sale_drafts') {
          saleDraftsCallCount++
          // First call is for deletion, second is for verification
          return saleDraftsCallCount === 1 ? draftDeleteChain : draftVerificationChain
        }
        return createChainableQueryBuilder()
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

      // Mock draft lookup - needs to support .select().eq().eq().maybeSingle() chain
      const draftChain = createChainableQueryBuilder()
      draftChain.maybeSingle.mockResolvedValue({
        data: {
          id: draftId,
          draft_key: draftKey,
          user_id: userId,
          status: 'active',
          payload: validatedPayload,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue(draftChain)

      // Mock sale creation (succeeds)
      const saleInsertChain = createChainableQueryBuilder()
      saleInsertChain.single.mockResolvedValue({
        data: { id: saleId },
        error: null,
      })

      // Mock items creation (fails)
      const itemsInsertChain = createChainableQueryBuilder()
      itemsInsertChain.select.mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'Foreign key constraint violation',
        },
      })

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return saleInsertChain
        }
        if (table === 'items') {
          return itemsInsertChain
        }
        return createChainableQueryBuilder()
      })

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

