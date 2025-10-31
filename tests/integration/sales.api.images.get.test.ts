/**
 * Regression test for /api/sales GET endpoint returning images and cover_image_url
 * 
 * Verifies that:
 * - GET /api/sales returns cover_image_url field
 * - GET /api/sales returns images array field
 * - Both fields are present in the response data
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase with sales that have images
const mockSalesWithImages = [
  {
    id: 'sale-1',
    title: 'Sale with Cover Image',
    cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover1.jpg',
    images: [
      'https://res.cloudinary.com/test/image/upload/v123/cover1.jpg',
      'https://res.cloudinary.com/test/image/upload/v123/img2.jpg'
    ],
    lat: 38.2527,
    lng: -85.7585,
    status: 'published'
  },
  {
    id: 'sale-2',
    title: 'Sale without Images',
    cover_image_url: null,
    images: [],
    lat: 38.2530,
    lng: -85.7590,
    status: 'published'
  },
  {
    id: 'sale-3',
    title: 'Sale with Images Array Only',
    cover_image_url: null,
    images: [
      'https://res.cloudinary.com/test/image/upload/v123/img3.jpg'
    ],
    lat: 38.2540,
    lng: -85.7600,
    status: 'published'
  }
]

const mockSupabaseClient = {
  from: vi.fn(() => {
    const chain: any = {
      select: vi.fn((columns: string, options?: any) => {
        // Handle count query: select('*', { count: 'exact', head: true })
        if (options?.count === 'exact' && options?.head === true) {
          return Promise.resolve({ count: mockSalesWithImages.length, error: null })
        }
        // Regular select returns chain
        return chain
      }),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      or: vi.fn(() => chain),
      order: vi.fn(() => chain),
      range: vi.fn(() => Promise.resolve({ data: mockSalesWithImages, error: null }))
    }
    return chain
  })
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient
}))

// Mock rate limiting
vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler
}))

let GET: any
beforeAll(async () => {
  const route = await import('@/app/api/sales/route')
  GET = route.GET
})

describe('Sales API GET - Image Fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return cover_image_url in GET response', async () => {
    const request = new NextRequest('http://localhost:3000/api/sales?lat=38.2527&lng=-85.7585')
    const response = await GET(request)
    const data = await response.json()

    if (response.status !== 200) {
      console.error('Response error:', data)
    }
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    
    // Find sale with cover image
    const saleWithCover = data.data.find((s: any) => s.id === 'sale-1')
    expect(saleWithCover).toBeDefined()
    expect(saleWithCover.cover_image_url).toBe('https://res.cloudinary.com/test/image/upload/v123/cover1.jpg')
  })

  it('should return images array in GET response', async () => {
    const request = new NextRequest('http://localhost:3000/api/sales?lat=38.2527&lng=-85.7585')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    
    // Find sale with images
    const saleWithImages = data.data.find((s: any) => s.id === 'sale-1')
    expect(saleWithImages).toBeDefined()
    expect(Array.isArray(saleWithImages.images)).toBe(true)
    expect(saleWithImages.images).toHaveLength(2)
    expect(saleWithImages.images[0]).toBe('https://res.cloudinary.com/test/image/upload/v123/cover1.jpg')
  })

  it('should return null cover_image_url when no cover image', async () => {
    const request = new NextRequest('http://localhost:3000/api/sales?lat=38.2527&lng=-85.7585')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    
    // Find sale without cover image
    const saleWithoutCover = data.data.find((s: any) => s.id === 'sale-2')
    expect(saleWithoutCover).toBeDefined()
    expect(saleWithoutCover.cover_image_url).toBeNull()
  })

  it('should return empty images array when no images', async () => {
    const request = new NextRequest('http://localhost:3000/api/sales?lat=38.2527&lng=-85.7585')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    
    // Find sale without images
    const saleWithoutImages = data.data.find((s: any) => s.id === 'sale-2')
    expect(saleWithoutImages).toBeDefined()
    expect(Array.isArray(saleWithoutImages.images)).toBe(true)
    expect(saleWithoutImages.images).toHaveLength(0)
  })

  it('should include both cover_image_url and images in all sales', async () => {
    const request = new NextRequest('http://localhost:3000/api/sales?lat=38.2527&lng=-85.7585')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    
    // Verify all sales have both fields
    data.data.forEach((sale: any) => {
      expect(sale).toHaveProperty('cover_image_url')
      expect(sale).toHaveProperty('images')
      expect(Array.isArray(sale.images)).toBe(true)
    })
  })

  it('should handle sales with images array but no cover_image_url', async () => {
    const request = new NextRequest('http://localhost:3000/api/sales?lat=38.2527&lng=-85.7585')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    
    // Find sale with images but no cover
    const saleWithImagesOnly = data.data.find((s: any) => s.id === 'sale-3')
    expect(saleWithImagesOnly).toBeDefined()
    expect(saleWithImagesOnly.cover_image_url).toBeNull()
    expect(Array.isArray(saleWithImagesOnly.images)).toBe(true)
    expect(saleWithImagesOnly.images).toHaveLength(1)
  })
})

