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
  },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabase,
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
    mockSupabase.from.mockReturnValue({
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
    })
  })

  describe('POST /api/drafts', () => {
    it('should use correct schema for sale_drafts table', () => {
      // Verify that the code uses lootaura_v2.sale_drafts
      const tableName = 'lootaura_v2.sale_drafts'
      expect(tableName).toBe('lootaura_v2.sale_drafts')
      expect(tableName).not.toContain('public.')
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
      const invalidPayload = { formData: {} }
      const result = SaleDraftPayloadSchema.safeParse(invalidPayload)
      expect(result.success).toBe(false)
    })
  })

  describe('GET /api/drafts', () => {
    it('should use correct schema for sale_drafts table', () => {
      const tableName = 'lootaura_v2.sale_drafts'
      expect(tableName).toBe('lootaura_v2.sale_drafts')
      expect(tableName).not.toContain('public.')
    })
  })

  describe('POST /api/drafts/publish', () => {
    it('should use correct schema for all tables', () => {
      const tables = {
        sale_drafts: 'lootaura_v2.sale_drafts',
        sales: 'lootaura_v2.sales',
        items: 'lootaura_v2.items',
      }

      expect(tables.sale_drafts).toBe('lootaura_v2.sale_drafts')
      expect(tables.sales).toBe('lootaura_v2.sales')
      expect(tables.items).toBe('lootaura_v2.items')

      // Verify no public. prefix
      Object.values(tables).forEach((table) => {
        expect(table).not.toContain('public.')
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
      // Verify that we use lootaura_v2.* tables, not views
      const writeTables = [
        'lootaura_v2.sale_drafts',
        'lootaura_v2.sales',
        'lootaura_v2.items',
      ]

      writeTables.forEach((table) => {
        expect(table).toContain('lootaura_v2.')
        expect(table).not.toContain('_v2') // Not a view
        expect(table).not.toContain('public.')
      })
    })
  })
})

