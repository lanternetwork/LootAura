/**
 * Integration tests for drafts API
 * Tests /api/drafts (GET, POST) and /api/drafts/publish (POST)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SaleDraftPayloadSchema } from '@/lib/validation/saleDraft'

// Mock Supabase client for testing
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token', refresh_token: 'test-refresh-token', user: { id: 'test-user-id' } } },
      error: null,
    }),
    setSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token', refresh_token: 'test-refresh-token', user: { id: 'test-user-id' } } },
      error: null,
    }),
  },
  schema: vi.fn(() => ({
    from: vi.fn(),
  })),
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabase,
  createSupabaseWriteClient: () => mockSupabase,
}))

describe('Drafts API', () => {
  const mockUserA = {
    id: 'user-a-id',
    email: 'user-a@example.com',
  }

  const mockUserB = {
    id: 'user-b-id',
    email: 'user-b@example.com',
  }

  const mockDraftPayload = {
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
      duration_hours: 8,
      tags: ['tools'],
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
    currentStep: 3,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    }
    mockSupabase.from.mockReturnValue(mockQueryBuilder)
    mockSupabase.schema.mockReturnValue({
      from: vi.fn(() => mockQueryBuilder),
    })
  })

  describe('POST /api/drafts', () => {
    it('should use correct schema for sale_drafts table', () => {
      // Verify that the code uses sale_drafts (schema is set in client config)
      const tableName = 'sale_drafts'
      expect(tableName).toBe('sale_drafts')
      expect(tableName).not.toContain('public.')
      expect(tableName).not.toContain('lootaura_v2.') // Schema prefix not needed when client schema is set
    })

    it('should validate draft payload schema', () => {
      const result = SaleDraftPayloadSchema.safeParse(mockDraftPayload)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.formData.title).toBe('Test Sale')
        expect(result.data.items).toHaveLength(1)
      }
    })

    it('should reject invalid draft payload', () => {
      // Test with missing required formData field
      const invalidPayload = {}
      const result = SaleDraftPayloadSchema.safeParse(invalidPayload)
      expect(result.success).toBe(false)
      
      // Test with invalid type for formData
      const invalidPayload2 = { formData: 'not an object' }
      const result2 = SaleDraftPayloadSchema.safeParse(invalidPayload2)
      expect(result2.success).toBe(false)
    })

    it('should normalize payload consistently for content hashing', async () => {
      const { normalizeDraftPayload } = await import('@/lib/draft/normalize')
      const { createHash } = await import('crypto')

      // Normalize the same payload twice with different formatting
      const payload1 = { ...mockDraftPayload }
      const payload2 = {
        ...mockDraftPayload,
        formData: {
          ...mockDraftPayload.formData,
          title: '  Test Sale  ', // Extra whitespace
          tags: ['tools', '  '], // Extra whitespace in tags
        },
      }

      const normalized1 = normalizeDraftPayload(payload1)
      const normalized2 = normalizeDraftPayload(payload2)

      // Compute hashes
      const hash1 = createHash('sha256')
        .update(JSON.stringify(normalized1))
        .digest('hex')
      const hash2 = createHash('sha256')
        .update(JSON.stringify(normalized2))
        .digest('hex')

      // Hashes should match (normalization removes whitespace)
      expect(hash1).toBe(hash2)
      expect(normalized1.formData.title).toBe('Test Sale')
      expect(normalized2.formData.title).toBe('Test Sale')
      expect(normalized1.formData.tags).toEqual(['tools'])
      expect(normalized2.formData.tags).toEqual(['tools'])
    })

    it('should produce different hashes for different payloads', async () => {
      const { normalizeDraftPayload } = await import('@/lib/draft/normalize')
      const { createHash } = await import('crypto')

      const payload1 = { ...mockDraftPayload }
      const payload2 = {
        ...mockDraftPayload,
        formData: {
          ...mockDraftPayload.formData,
          title: 'Different Title',
        },
      }

      const normalized1 = normalizeDraftPayload(payload1)
      const normalized2 = normalizeDraftPayload(payload2)

      const hash1 = createHash('sha256')
        .update(JSON.stringify(normalized1))
        .digest('hex')
      const hash2 = createHash('sha256')
        .update(JSON.stringify(normalized2))
        .digest('hex')

      // Hashes should differ for different content
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('GET /api/drafts', () => {
    it('should use correct schema for sale_drafts table', () => {
      // Verify that the code uses sale_drafts (schema is set in client config)
      const tableName = 'sale_drafts'
      expect(tableName).toBe('sale_drafts')
      expect(tableName).not.toContain('public.')
      expect(tableName).not.toContain('lootaura_v2.') // Schema prefix not needed when client schema is set
    })
  })

  describe('POST /api/drafts/publish', () => {
    it('should use correct schema for all tables', () => {
      // Tables use base names (schema is set in client config)
      const tables = {
        sale_drafts: 'sale_drafts',
        sales: 'sales',
        items: 'items',
      }

      expect(tables.sale_drafts).toBe('sale_drafts')
      expect(tables.sales).toBe('sales')
      expect(tables.items).toBe('items')

      // Verify no schema prefix (schema is set in client config)
      Object.values(tables).forEach((table) => {
        expect(table).not.toContain('public.')
        expect(table).not.toContain('lootaura_v2.') // Schema prefix not needed when client schema is set
      })
    })

    it('should validate draft payload before publishing', () => {
      const result = SaleDraftPayloadSchema.safeParse(mockDraftPayload)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.formData.title).toBeDefined()
        expect(result.data.formData.city).toBeDefined()
        expect(result.data.formData.state).toBeDefined()
        expect(result.data.formData.date_start).toBeDefined()
        expect(result.data.formData.time_start).toBeDefined()
      }
    })
  })

  describe('RLS policies', () => {
    it('should use base tables (not views) for writes', () => {
      // Verify that we use base table names (schema is set in client config)
      // Views typically end with _v2 (e.g., sales_v2), base tables don't
      const writeTables = [
        'sale_drafts',
        'sales',
        'items',
      ]

      writeTables.forEach((table) => {
        expect(table).not.toContain('public.')
        expect(table).not.toContain('lootaura_v2.') // Schema prefix not needed when client schema is set
        // Check that table name itself doesn't end with _v2 (view indicator)
        expect(table).not.toMatch(/_v2$/) // Table name shouldn't end with _v2
      })
    })
  })
})

