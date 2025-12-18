/**
 * Regression test for draft resume identity bug
 * 
 * BUG: Resuming a draft + making a change creates a NEW draft instead of updating the existing one
 * ROOT CAUSE: Client does not reliably adopt the resumed draft's draft_key
 * 
 * This test verifies that:
 * 1. When a draft is resumed, its draft_key is adopted
 * 2. Subsequent saves update the SAME draft (same draft_key)
 * 3. No duplicate drafts are created
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/drafts/route'
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

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseServer,
  createSupabaseWriteClient: () => mockSupabaseServer,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
  getAdminDb: () => mockAdminDb,
  fromBase: (client: any, table: string) => client.from(table),
}))

vi.mock('@/lib/api/csrfCheck', () => ({
  checkCsrfIfRequired: async () => null, // No CSRF error
}))

vi.mock('@/lib/auth/accountLock', () => ({
  assertAccountNotLocked: async () => {}, // No lock
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

describe('Draft Resume Identity', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  }

  const originalDraftKey = 'original-draft-key-123'
  const originalDraftId = 'draft-original-123'

  const originalPayload: SaleDraftPayload = {
    formData: {
      title: 'Original Sale',
      description: 'Original description',
      city: 'Test City',
      state: 'TS',
      date_start: '2025-12-01',
      time_start: '09:00',
    },
    photos: [],
    items: [],
    currentStep: 0,
  }

  const modifiedPayload: SaleDraftPayload = {
    formData: {
      title: 'Modified Sale', // Changed title
      description: 'Original description',
      city: 'Test City',
      state: 'TS',
      date_start: '2025-12-01',
      time_start: '09:00',
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

    // Setup query builder mocks
    const createQueryBuilder = () => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    })

    mockRlsDb.from.mockReturnValue(createQueryBuilder())
    mockAdminDb.from.mockReturnValue(createQueryBuilder())
  })

  it('should update existing draft when resuming and making changes (same draft_key)', async () => {
    // Step 1: Simulate initial draft creation (user creates a draft)
    const createRequest = new NextRequest('http://localhost/api/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: originalPayload,
        draftKey: originalDraftKey,
      }),
    })

    // Mock: No existing draft (first save)
    const rlsQueryBuilder1 = mockRlsDb.from()
    rlsQueryBuilder1.maybeSingle.mockResolvedValue({
      data: null, // No existing draft
      error: null,
    })

    // Mock: Successful insert
    const adminQueryBuilder1 = mockAdminDb.from()
    const createdDraft = {
      id: originalDraftId,
      draft_key: originalDraftKey,
      title: 'Original Sale',
      status: 'active',
      updated_at: '2025-01-01T00:00:00Z',
    }
    adminQueryBuilder1.single.mockResolvedValue({
      data: createdDraft,
      error: null,
    })

    const createResponse = await POST(createRequest)
    const createResult = await createResponse.json()
    
    expect(createResult.ok).toBe(true)
    expect(createResult.data.id).toBe(originalDraftId)

    // Step 2: Simulate resume (GET latest draft)
    const getRequest = new NextRequest('http://localhost/api/drafts', {
      method: 'GET',
    })

    // Mock: Return existing draft with draft_key
    const rlsQueryBuilder2 = mockRlsDb.from()
    rlsQueryBuilder2.maybeSingle.mockResolvedValue({
      data: {
        id: originalDraftId,
        draft_key: originalDraftKey, // CRITICAL: draft_key must be returned
        payload: originalPayload,
        updated_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })

    const getResponse = await GET(getRequest)
    const getResult = await getResponse.json()
    
    expect(getResult.ok).toBe(true)
    expect(getResult.data).not.toBeNull()
    expect(getResult.data.id).toBe(originalDraftId)
    expect(getResult.data.draft_key).toBe(originalDraftKey) // CRITICAL: draft_key must be present

    // Step 3: Simulate save after making changes (user modifies and saves)
    const saveRequest = new NextRequest('http://localhost/api/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: modifiedPayload, // Modified content
        draftKey: originalDraftKey, // SAME draft_key (adopted from resume)
      }),
    })

    // Mock: Existing draft found (with different content hash)
    const rlsQueryBuilder3 = mockRlsDb.from()
    rlsQueryBuilder3.maybeSingle.mockResolvedValue({
      data: {
        id: originalDraftId,
        content_hash: 'original-hash', // Different hash (content changed)
        updated_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })

    // Mock: Successful update (NOT insert)
    const adminQueryBuilder3 = mockAdminDb.from()
    const updatedDraft = {
      id: originalDraftId, // SAME ID
      draft_key: originalDraftKey, // SAME draft_key
      title: 'Modified Sale',
      status: 'active',
      updated_at: '2025-01-01T01:00:00Z', // Updated timestamp
    }
    adminQueryBuilder3.single.mockResolvedValue({
      data: updatedDraft,
      error: null,
    })

    const saveResponse = await POST(saveRequest)
    const saveResult = await saveResponse.json()
    
    // Should return success
    expect(saveResult.ok).toBe(true)
    
    // CRITICAL: Should update the SAME draft (same ID, same draft_key)
    expect(saveResult.data.id).toBe(originalDraftId)
    expect(saveResult.data.deduped).toBeUndefined() // Not a no-op save

    // CRITICAL: Should call UPDATE, not INSERT
    expect(adminQueryBuilder3.update).toHaveBeenCalled()
    expect(adminQueryBuilder3.insert).not.toHaveBeenCalled()

    // Verify update was called with correct draft_key
    const updateCall = adminQueryBuilder3.update.mock.calls[0][0]
    expect(updateCall).toBeDefined()
    
    // Verify the update query targets the correct draft
    expect(adminQueryBuilder3.eq).toHaveBeenCalledWith('id', originalDraftId)
  })

  it('should NOT create duplicate draft when resuming with same draft_key', async () => {
    // Simulate scenario: User resumes draft, makes change, saves
    // If draft_key is not adopted, a NEW draft would be created

    // Step 1: GET existing draft (resume)
    const getRequest = new NextRequest('http://localhost/api/drafts', {
      method: 'GET',
    })

    const rlsQueryBuilder1 = mockRlsDb.from()
    rlsQueryBuilder1.maybeSingle.mockResolvedValue({
      data: {
        id: originalDraftId,
        draft_key: originalDraftKey,
        payload: originalPayload,
        updated_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })

    const getResponse = await GET(getRequest)
    const getResult = await getResponse.json()
    
    expect(getResult.data.draft_key).toBe(originalDraftKey)

    // Step 2: Save with modified content using the SAME draft_key
    const saveRequest = new NextRequest('http://localhost/api/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: modifiedPayload,
        draftKey: originalDraftKey, // Using the resumed draft's key
      }),
    })

    // Mock: Existing draft found (same draft_key, different content)
    const rlsQueryBuilder2 = mockRlsDb.from()
    rlsQueryBuilder2.maybeSingle.mockResolvedValue({
      data: {
        id: originalDraftId,
        content_hash: 'different-hash',
        updated_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })

    const adminQueryBuilder2 = mockAdminDb.from()
    adminQueryBuilder2.single.mockResolvedValue({
      data: {
        id: originalDraftId, // SAME ID
        draft_key: originalDraftKey, // SAME draft_key
        title: 'Modified Sale',
        status: 'active',
        updated_at: '2025-01-01T01:00:00Z',
      },
      error: null,
    })

    const saveResponse = await POST(saveRequest)
    const saveResult = await saveResponse.json()
    
    expect(saveResult.ok).toBe(true)
    expect(saveResult.data.id).toBe(originalDraftId) // Same draft, not new

    // CRITICAL: Should update, not insert
    expect(adminQueryBuilder2.update).toHaveBeenCalled()
    expect(adminQueryBuilder2.insert).not.toHaveBeenCalled()
  })

  it('should return draft_key in GET response', async () => {
    // This test ensures the API returns draft_key (required for client to adopt it)
    const getRequest = new NextRequest('http://localhost/api/drafts', {
      method: 'GET',
    })

    const rlsQueryBuilder = mockRlsDb.from()
    rlsQueryBuilder.maybeSingle.mockResolvedValue({
      data: {
        id: originalDraftId,
        draft_key: originalDraftKey, // Must be selected
        payload: originalPayload,
        updated_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })

    const getResponse = await GET(getRequest)
    const getResult = await getResponse.json()
    
    expect(getResult.ok).toBe(true)
    expect(getResult.data).not.toBeNull()
    
    // CRITICAL: draft_key must be present in response
    expect(getResult.data.draft_key).toBe(originalDraftKey)
    expect(getResult.data.id).toBe(originalDraftId)
    expect(getResult.data.payload).toBeDefined()

    // Verify the query selected draft_key
    expect(rlsQueryBuilder.select).toHaveBeenCalledWith('id, draft_key, payload, updated_at')
  })
})

