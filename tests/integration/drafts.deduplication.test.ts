/**
 * Integration tests for draft deduplication
 * Tests that no-op saves don't create new drafts or update existing ones
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/drafts/route'
import { hashDraftContent } from '@/lib/draft/contentHash'
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

describe('Draft Deduplication', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  }

  const basePayload: SaleDraftPayload = {
    formData: {
      title: 'Test Sale',
      description: 'Test description',
      city: 'Test City',
      state: 'TS',
      date_start: '2025-12-01',
      time_start: '09:00',
    },
    photos: [],
    items: [
      {
        id: 'item-1',
        name: 'Test Item',
        price: 10,
        category: 'tools',
      },
    ],
    currentStep: 2,
  }

  const draftKey = 'test-draft-key-123'

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
      single: vi.fn(),
      maybeSingle: vi.fn(),
    })

    mockRlsDb.from.mockReturnValue(createQueryBuilder())
    mockAdminDb.from.mockReturnValue(createQueryBuilder())
  })

  describe('Server-side deduplication', () => {
    it('should skip update when content hash matches existing draft', async () => {
      const contentHash = hashDraftContent(basePayload)
      
      // Mock existing draft with matching hash
      const existingDraft = {
        id: 'draft-123',
        content_hash: contentHash,
        updated_at: '2025-01-01T00:00:00Z',
      }

      const rlsQueryBuilder = mockRlsDb.from()
      rlsQueryBuilder.maybeSingle.mockResolvedValue({
        data: existingDraft,
        error: null,
      })

      // Create request
      const request = new NextRequest('http://localhost/api/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: basePayload,
          draftKey,
        }),
      })

      // Call handler
      const response = await POST(request)
      const result = await response.json()

      // Should return success with deduped flag
      expect(result.ok).toBe(true)
      expect(result.data.id).toBe(existingDraft.id)
      expect(result.data.deduped).toBe(true)

      // Should NOT call update (no-op save)
      const adminQueryBuilder = mockAdminDb.from()
      expect(adminQueryBuilder.update).not.toHaveBeenCalled()
    })

    it('should update when content hash differs', async () => {
      const originalHash = hashDraftContent(basePayload)
      
      // Mock existing draft with different hash
      const existingDraft = {
        id: 'draft-123',
        content_hash: 'different-hash',
        updated_at: '2025-01-01T00:00:00Z',
      }

      const rlsQueryBuilder = mockRlsDb.from()
      rlsQueryBuilder.maybeSingle.mockResolvedValue({
        data: existingDraft,
        error: null,
      })

      // Mock successful update
      const adminQueryBuilder = mockAdminDb.from()
      const updatedDraft = {
        id: existingDraft.id,
        draft_key: draftKey,
        title: 'Test Sale',
        status: 'active',
        updated_at: '2025-01-01T01:00:00Z',
      }
      adminQueryBuilder.single.mockResolvedValue({
        data: updatedDraft,
        error: null,
      })

      // Create request
      const request = new NextRequest('http://localhost/api/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: basePayload,
          draftKey,
        }),
      })

      // Call handler
      const response = await POST(request)
      const result = await response.json()

      // Should return success without deduped flag
      expect(result.ok).toBe(true)
      expect(result.data.id).toBe(existingDraft.id)
      expect(result.data.deduped).toBeUndefined()

      // Should call update with new content_hash
      expect(adminQueryBuilder.update).toHaveBeenCalled()
      const updateCall = adminQueryBuilder.update.mock.calls[0][0]
      expect(updateCall.content_hash).toBe(originalHash)
    })

    it('should create new draft when no existing draft', async () => {
      // Mock no existing draft
      const rlsQueryBuilder = mockRlsDb.from()
      rlsQueryBuilder.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })

      // Mock successful insert
      const adminQueryBuilder = mockAdminDb.from()
      const newDraft = {
        id: 'draft-new-123',
        draft_key: draftKey,
        title: 'Test Sale',
        status: 'active',
        updated_at: '2025-01-01T00:00:00Z',
      }
      adminQueryBuilder.single.mockResolvedValue({
        data: newDraft,
        error: null,
      })

      // Create request
      const request = new NextRequest('http://localhost/api/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: basePayload,
          draftKey,
        }),
      })

      // Call handler
      const response = await POST(request)
      const result = await response.json()

      // Should return success
      expect(result.ok).toBe(true)
      expect(result.data.id).toBe(newDraft.id)
      expect(result.data.deduped).toBeUndefined()

      // Should call insert
      expect(adminQueryBuilder.insert).toHaveBeenCalled()
      const insertCall = adminQueryBuilder.insert.mock.calls[0][0]
      expect(insertCall.content_hash).toBe(hashDraftContent(basePayload))
    })

    it('should ignore currentStep changes in hash comparison', async () => {
      const payload1: SaleDraftPayload = { ...basePayload, currentStep: 0 }
      const payload2: SaleDraftPayload = { ...basePayload, currentStep: 3 }
      
      const hash1 = hashDraftContent(payload1)
      const hash2 = hashDraftContent(payload2)
      
      // Hashes should be identical (currentStep is excluded)
      expect(hash1).toBe(hash2)
    })

    it('should detect changes in meaningful fields', async () => {
      const payload1: SaleDraftPayload = { ...basePayload, formData: { ...basePayload.formData, title: 'Title 1' } }
      const payload2: SaleDraftPayload = { ...basePayload, formData: { ...basePayload.formData, title: 'Title 2' } }
      
      const hash1 = hashDraftContent(payload1)
      const hash2 = hashDraftContent(payload2)
      
      // Hashes should differ
      expect(hash1).not.toBe(hash2)
    })

    it('should handle item reordering consistently', async () => {
      const payload1: SaleDraftPayload = {
        ...basePayload,
        items: [
          { id: 'item-1', name: 'Item A', category: 'tools' },
          { id: 'item-2', name: 'Item B', category: 'furniture' },
        ],
      }
      const payload2: SaleDraftPayload = {
        ...basePayload,
        items: [
          { id: 'item-2', name: 'Item B', category: 'furniture' },
          { id: 'item-1', name: 'Item A', category: 'tools' },
        ],
      }
      
      const hash1 = hashDraftContent(payload1)
      const hash2 = hashDraftContent(payload2)
      
      // Hashes should be identical (items are sorted by name for consistency)
      expect(hash1).toBe(hash2)
    })
  })

  describe('Content hash canonicalization', () => {
    it('should produce same hash for semantically identical payloads', () => {
      const payload1: SaleDraftPayload = {
        formData: {
          title: 'Test',
          city: 'City',
          state: 'ST',
          date_start: '2025-01-01',
          time_start: '09:00',
        },
        photos: [],
        items: [],
        currentStep: 0,
      }

      const payload2: SaleDraftPayload = {
        formData: {
          title: 'Test',
          city: 'City',
          state: 'ST',
          date_start: '2025-01-01',
          time_start: '09:00',
        },
        photos: [],
        items: [],
        currentStep: 3, // Different step, but should not affect hash
      }

      const hash1 = hashDraftContent(payload1)
      const hash2 = hashDraftContent(payload2)

      expect(hash1).toBe(hash2)
    })

    it('should produce different hash for different content', () => {
      const payload1: SaleDraftPayload = {
        formData: {
          title: 'Test 1',
          city: 'City',
          state: 'ST',
          date_start: '2025-01-01',
          time_start: '09:00',
        },
        photos: [],
        items: [],
        currentStep: 0,
      }

      const payload2: SaleDraftPayload = {
        formData: {
          title: 'Test 2', // Different title
          city: 'City',
          state: 'ST',
          date_start: '2025-01-01',
          time_start: '09:00',
        },
        photos: [],
        items: [],
        currentStep: 0,
      }

      const hash1 = hashDraftContent(payload1)
      const hash2 = hashDraftContent(payload2)

      expect(hash1).not.toBe(hash2)
    })
  })
})

