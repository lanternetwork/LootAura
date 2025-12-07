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
    owner_id: 'user-1',
    title: 'Sale with Cover Image',
    description: 'Test description',
    address: '123 Main St',
    city: 'Louisville',
    state: 'KY',
    zip_code: '40204',
    cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover1.jpg',
    images: [
      'https://res.cloudinary.com/test/image/upload/v123/cover1.jpg',
      'https://res.cloudinary.com/test/image/upload/v123/img2.jpg'
    ],
    lat: 38.2527,
    lng: -85.7585,
    date_start: '2026-01-15',
    time_start: '10:00',
    date_end: null,
    time_end: null,
    price: 100,
    tags: [],
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'sale-2',
    owner_id: 'user-2',
    title: 'Sale without Images',
    description: 'Test description',
    address: '456 Oak Ave',
    city: 'Louisville',
    state: 'KY',
    zip_code: '40205',
    cover_image_url: null,
    images: [],
    lat: 38.2530,
    lng: -85.7590,
    date_start: '2026-01-16',
    time_start: '11:00',
    date_end: null,
    time_end: null,
    price: 50,
    tags: [],
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'sale-3',
    owner_id: 'user-3',
    title: 'Sale with Images Array Only',
    description: 'Test description',
    address: '789 Elm St',
    city: 'Louisville',
    state: 'KY',
    zip_code: '40206',
    cover_image_url: null,
    images: [
      'https://res.cloudinary.com/test/image/upload/v123/img3.jpg'
    ],
    lat: 38.2540,
    lng: -85.7600,
    date_start: '2026-01-17',
    time_start: '12:00',
    date_end: null,
    time_end: null,
    price: 75,
    tags: [],
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
]

const createQueryChain = (shouldReturnData: boolean = true) => {
  // Create a chainable mock object that's also awaitable
  let isCountQuery = false
  
  const createThenable = () => {
    const thenable = {
      then: (resolve: any, reject?: any) => {
        if (isCountQuery) {
          return Promise.resolve({ count: mockSalesWithImages.length, error: null }).then(resolve, reject)
        }
        if (shouldReturnData) {
          return Promise.resolve({ data: mockSalesWithImages, error: null }).then(resolve, reject)
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject)
      },
      catch: (reject: any) => {
        return Promise.resolve({ data: [], error: null }).catch(reject)
      }
    }
    return thenable
  }
  
  const chain: any = createThenable()
  
  // Methods that return the chain itself for further chaining
  chain.select = vi.fn((columns: string, options?: any) => {
    // Track if this is a count query
    if (options?.count === 'exact' && options?.head === true) {
      isCountQuery = true
    } else {
      isCountQuery = false
    }
    // Return chain for further chaining
    return chain
  })
  chain.gte = vi.fn(() => chain)
  chain.lte = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain) // Chain continues, resolution happens on await
  chain.in = vi.fn(() => chain)
  chain.or = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.limit = vi.fn(() => chain)
  
  // Final method that returns data (not used for count queries)
  chain.range = vi.fn(() => {
    if (shouldReturnData) {
      return Promise.resolve({ data: mockSalesWithImages, error: null })
    }
    return Promise.resolve({ data: [], error: null })
  })
  
  return chain
}

const createItemsV2Chain = () => {
  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.in = vi.fn(() => Promise.resolve({ data: [], error: null }))
  chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
  return chain
}

const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null })
  },
  from: vi.fn((table: string) => {
    if (table === 'items_v2') {
      // Return chain for items_v2 queries (no category filtering in tests)
      return createItemsV2Chain()
    }
    // For sales_v2 table
    return createQueryChain(true)
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
    // Ensure mock structure is preserved
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'items_v2') {
        return createItemsV2Chain()
      }
      return createQueryChain(true)
    })
  })

  it('should return cover_image_url in GET response', async () => {
    const request = new NextRequest('http://localhost:3000/api/sales?lat=38.2527&lng=-85.7585')
    const response = await GET(request)
    const data = await response.json()

    if (response.status !== 200) {
      console.error('Response error:', JSON.stringify(data, null, 2))
    }
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBeGreaterThan(0)
    
    // Find sale with cover image
    const saleWithCover = data.data.find((s: any) => s.id === 'sale-1')
    expect(saleWithCover).toBeDefined()
    expect(saleWithCover).toHaveProperty('cover_image_url')
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

