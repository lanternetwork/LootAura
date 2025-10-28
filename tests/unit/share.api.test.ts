/**
 * Unit tests for share API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/share/route'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn()
}))

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test12345')
}))

describe('Share API', () => {
  const mockSupabase = {
    from: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('POST /api/share', () => {
    it('should create a shareable link', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

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
      expect(mockSupabase.from).toHaveBeenCalledWith('shared_states')
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
      expect(data.error).toBe('Invalid request format')
    })

    it('should handle database errors', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: { message: 'Database error' } })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

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
      expect(data.error).toBe('Failed to create shareable link')
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
      mockSupabase.from.mockReturnValue({ select: mockSelect })

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
      expect(data.error).toBe('Missing short ID')
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
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const request = new NextRequest('http://localhost:3000/api/share?id=nonexistent')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Share link not found')
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
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const request = new NextRequest('http://localhost:3000/api/share?id=test12345')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to retrieve shareable link')
    })
  })
})

