import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase
const mockSingle = vi.fn()
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null })
  },
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: mockSingle
      }))
    }))
  }))
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient
}))

// Mock rate limiting
vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler
}))

// Mock image validation
vi.mock('@/lib/images/validateImageUrl', () => ({
  isAllowedImageUrl: vi.fn((url: string) => url.includes('res.cloudinary.com'))
}))

let POST: any
beforeAll(async () => {
  const route = await import('@/app/api/sales/route')
  POST = route.POST
})

describe('Sales API - Image Support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock authenticated user
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
      error: null
    })
    
    // Reset mockSingle with a default value
    mockSingle.mockResolvedValue({
      data: { id: 'default-sale-123' },
      error: null
    })
  })

  it('should accept and persist cover_image_url', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'sale-123', cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg' },
      error: null
    })

    const request = new NextRequest('http://localhost:3000/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Sale',
        description: 'Test Description',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345',
        lat: 38.2527,
        lng: -85.7585,
        date_start: '2024-01-01',
        time_start: '09:00',
        cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
      expect.objectContaining({
        cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg'
      })
    )
  })

  it('should accept and persist images array', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'sale-123', images: ['https://res.cloudinary.com/test/image/upload/v123/img1.jpg'] },
      error: null
    })

    const request = new NextRequest('http://localhost:3000/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Sale',
        description: 'Test Description',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345',
        lat: 38.2527,
        lng: -85.7585,
        date_start: '2024-01-01',
        time_start: '09:00',
        images: ['https://res.cloudinary.com/test/image/upload/v123/img1.jpg']
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
      expect.objectContaining({
        images: ['https://res.cloudinary.com/test/image/upload/v123/img1.jpg']
      })
    )
  })

  it('should reject invalid cover_image_url', async () => {
    const request = new NextRequest('http://localhost:3000/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Sale',
        description: 'Test Description',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345',
        lat: 38.2527,
        lng: -85.7585,
        date_start: '2024-01-01',
        time_start: '09:00',
        cover_image_url: 'https://malicious-site.com/image.jpg'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid cover_image_url')
  })

  it('should reject invalid image URLs in images array', async () => {
    const request = new NextRequest('http://localhost:3000/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Sale',
        description: 'Test Description',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345',
        lat: 38.2527,
        lng: -85.7585,
        date_start: '2024-01-01',
        time_start: '09:00',
        images: [
          'https://res.cloudinary.com/test/image/upload/v123/img1.jpg',
          'https://malicious-site.com/image.jpg'
        ]
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid image URL in images array')
  })

  it('should handle empty images array', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'sale-123', images: [] },
      error: null
    })

    const request = new NextRequest('http://localhost:3000/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Sale',
        description: 'Test Description',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345',
        lat: 38.2527,
        lng: -85.7585,
        date_start: '2024-01-01',
        time_start: '09:00',
        images: []
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
      expect.objectContaining({
        images: []
      })
    )
  })

  it('should default images to empty array when not provided', async () => {
    const mockInsert = vi.fn().mockResolvedValue({
      data: { id: 'sale-123', images: [] },
      error: null
    })

    mockSupabaseClient.from().insert().select().single.mockResolvedValue({
      data: { id: 'sale-123', images: [] },
      error: null
    })

    const request = new NextRequest('http://localhost:3000/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Sale',
        description: 'Test Description',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345',
        lat: 38.2527,
        lng: -85.7585,
        date_start: '2024-01-01',
        time_start: '09:00'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
      expect.objectContaining({
        images: []
      })
    )
  })
})