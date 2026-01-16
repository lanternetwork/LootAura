/**
 * Regression test: Ensure checkout page uses correct sale cover image
 * 
 * This test verifies that:
 * 1. When sale has cover_image_url, checkout uses that image
 * 2. When sale has images array, checkout uses first image
 * 3. When sale has no images, checkout shows no-image state
 * 4. Summary API uses no-store cache to prevent stale data
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockSupabaseClient = {
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

describe('Promotion Checkout Image Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/sales/[id]/summary', () => {

    it('returns cover_image_url when sale has explicit cover image', async () => {
      const { GET } = await import('@/app/api/sales/[id]/summary/route')
      
      const saleId = 'sale-with-cover'
      const mockSale = {
        title: 'Test Sale',
        city: 'Test City',
        state: 'TS',
        cover_image_url: 'https://example.com/cover.jpg',
      }

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockSale,
          error: null,
        }),
      })

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/summary`)
      const response = await GET(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.photoUrl).toBe('https://example.com/cover.jpg')
      expect(data.title).toBe('Test Sale')
    })

    it('returns null photoUrl when sale has no cover image', async () => {
      const { GET } = await import('@/app/api/sales/[id]/summary/route')
      
      const saleId = 'sale-no-cover'
      const mockSale = {
        title: 'Test Sale',
        city: 'Test City',
        state: 'TS',
        cover_image_url: null,
      }

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockSale,
          error: null,
        }),
      })

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/summary`)
      const response = await GET(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.photoUrl).toBe(null)
      expect(data.title).toBe('Test Sale')
    })

    it('uses no-store cache policy (verified via route config)', async () => {
      // Verify route exports revalidate: 0
      const route = await import('@/app/api/sales/[id]/summary/route')
      expect(route.revalidate).toBe(0)
      expect(route.dynamic).toBe('force-dynamic')
    })
  })

  describe('getSaleCoverUrl function', () => {
    it('prefers cover_image_url over images array', async () => {
      const { getSaleCoverUrl } = await import('@/lib/images/cover')
      
      const sale = {
        title: 'Test Sale',
        cover_image_url: 'https://example.com/cover.jpg',
        images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
      }

      const result = getSaleCoverUrl(sale)
      expect(result).not.toBeNull()
      expect(result?.url).toBe('https://example.com/cover.jpg')
    })

    it('falls back to first image in images array when no cover_image_url', async () => {
      const { getSaleCoverUrl } = await import('@/lib/images/cover')
      
      const sale = {
        title: 'Test Sale',
        cover_image_url: null,
        images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
      }

      const result = getSaleCoverUrl(sale)
      expect(result).not.toBeNull()
      expect(result?.url).toBe('https://example.com/image1.jpg')
    })

    it('returns null when sale has no images', async () => {
      const { getSaleCoverUrl } = await import('@/lib/images/cover')
      
      const sale = {
        title: 'Test Sale',
        cover_image_url: null,
        images: null,
      }

      const result = getSaleCoverUrl(sale)
      expect(result).toBeNull()
    })
  })
})
