/**
 * Unit tests for share API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/share/route'
import { getAdminDb } from '@/lib/supabase/clients'
import { shouldBypassRateLimit } from '@/lib/rateLimit/config'
import { deriveKey } from '@/lib/rateLimit/keys'
import { check } from '@/lib/rateLimit/limiter'

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn()
}))
vi.mock('@/lib/rateLimit/config', () => ({
  shouldBypassRateLimit: vi.fn(() => true)
}))
vi.mock('@/lib/rateLimit/keys', () => ({
  deriveKey: vi.fn(async () => 'test-key')
}))
vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn(async () => ({
    allowed: true,
    softLimited: false,
    remaining: 100,
    resetAt: Math.floor(Date.now() / 1000) + 60,
  }))
}))

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test12345')
}))

describe('Share API', () => {
  const mockAdminDb = {
    from: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAdminDb).mockReturnValue(mockAdminDb as any)
    vi.mocked(shouldBypassRateLimit).mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('POST /api/share', () => {
    it('should create a shareable link', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null })
      mockAdminDb.from.mockReturnValue({ insert: mockInsert })

      const requestBody = {
        state: {
          view: { lat: 40.7128, lng: -74.0060, zoom: 12 },
          filters: { dateRange: 'today', categories: ['furniture'], radius: 50 }
        }
      }

      const request = new NextRequest('http://localhost:3000/api/share', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ shortId: 'test12345' })
      expect(mockAdminDb.from).toHaveBeenCalledWith('shared_states')
      expect(mockInsert).toHaveBeenCalledWith({
        id: 'test12345',
        state_json: requestBody.state,
        version: 1
      })
    })

    it('should handle invalid request format', async () => {
      const requestBody = {
        invalid: 'data'
      }

      const request = new NextRequest('http://localhost:3000/api/share', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error?.message).toBe('Invalid request format')
      expect(data.error?.code).toBe('INVALID_REQUEST')
    })

    it('should handle database errors', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: { message: 'Database error' } })
      mockAdminDb.from.mockReturnValue({ insert: mockInsert })

      const requestBody = {
        state: {
          view: { lat: 40.7128, lng: -74.0060, zoom: 12 },
          filters: { dateRange: 'today', categories: [], radius: 25 }
        }
      }

      const request = new NextRequest('http://localhost:3000/api/share', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error?.message).toBe('Failed to create shareable link')
    })

    it('should return rate limited for POST when policy blocks request', async () => {
      vi.mocked(shouldBypassRateLimit).mockReturnValue(false)
      vi.mocked(check).mockResolvedValue({
        allowed: false,
        softLimited: false,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      })

      const request = new NextRequest('http://localhost:3000/api/share', {
        method: 'POST',
        body: JSON.stringify({
          state: {
            view: { lat: 1, lng: 2, zoom: 3 },
            filters: { dateRange: 'any', categories: [], radius: 25 },
          },
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data.code).toBe('RATE_LIMITED')
      expect(data.error?.message).toBe('Too many requests')
      expect(data.ok).toBe(false)
      expect(deriveKey).toHaveBeenCalled()
      expect(check).toHaveBeenCalled()
    })

    it('should reject oversized POST payload', async () => {
      const huge = 'a'.repeat(33 * 1024)
      const request = new NextRequest('http://localhost:3000/api/share', {
        method: 'POST',
        body: JSON.stringify({
          state: {
            view: { lat: 1, lng: 2, zoom: 3 },
            filters: { dateRange: huge, categories: [], radius: 25 },
          },
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(413)
      expect(data.code).toBe('PAYLOAD_TOO_LARGE')
      expect(data.error?.message).toBe('Request too large')
      expect(data.ok).toBe(false)
    })
  })

  describe('GET /api/share', () => {
    it('should retrieve shared state', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              state_json: {
                view: { lat: 40.7128, lng: -74.0060, zoom: 12 },
                filters: { dateRange: 'today', categories: ['furniture'], radius: 50 }
              }
            },
            error: null
          })
        })
      })
      mockAdminDb.from.mockReturnValue({ select: mockSelect })

      const request = new NextRequest('http://localhost:3000/api/share?id=test12345')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.state).toEqual({
        view: { lat: 40.7128, lng: -74.0060, zoom: 12 },
        filters: { dateRange: 'today', categories: ['furniture'], radius: 50 }
      })
    })

    it('should handle missing short ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/share')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error?.message).toBe('Missing short ID')
    })

    it('should handle share link not found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' }
          })
        })
      })
      mockAdminDb.from.mockReturnValue({ select: mockSelect })

      const request = new NextRequest('http://localhost:3000/api/share?id=nonexistent')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error?.message).toBe('Share link not found')
    })

    it('should handle database errors', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' }
          })
        })
      })
      mockAdminDb.from.mockReturnValue({ select: mockSelect })

      const request = new NextRequest('http://localhost:3000/api/share?id=test12345')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error?.message).toBe('Failed to retrieve shareable link')
    })

    it('should return rate limited for GET when policy blocks request', async () => {
      vi.mocked(shouldBypassRateLimit).mockReturnValue(false)
      vi.mocked(check).mockResolvedValue({
        allowed: false,
        softLimited: false,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      })

      const request = new NextRequest('http://localhost:3000/api/share?id=test12345')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data.code).toBe('RATE_LIMITED')
      expect(data.error?.message).toBe('Too many requests')
      expect(data.ok).toBe(false)
    })
  })
})
