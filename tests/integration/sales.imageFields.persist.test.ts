import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the validator
vi.mock('@/lib/images/validateImageUrl', () => ({
  isAllowedImageUrl: vi.fn()
}))

// Mock Supabase
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn()
  },
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn()
      }))
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    }))
  }))
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient
}))

describe('Sales Image Fields Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock authenticated user
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
      error: null
    })

    // Mock successful insert/update responses
    mockSupabaseClient.from().insert().select().single.mockResolvedValue({
      data: { id: 'test-sale-id', title: 'Test Sale' },
      error: null
    })

    mockSupabaseClient.from().update().eq().select().single.mockResolvedValue({
      data: { id: 'test-item-id', name: 'Test Item' },
      error: null
    })

    // Mock sale ownership check
    mockSupabaseClient.from().select().eq().eq().single.mockResolvedValue({
      data: { id: 'test-sale-id', owner_id: 'test-user-id' },
      error: null
    })
  })

  describe('POST /api/sales', () => {
    it('should accept valid cover_image_url', async () => {
      const { isAllowedImageUrl } = await import('@/lib/images/validateImageUrl')
      vi.mocked(isAllowedImageUrl).mockReturnValue(true)

      const { POST } = await import('@/app/api/sales/route')
      
      const request = new NextRequest('http://localhost/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Sale',
          description: 'Test Description',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip_code: '12345',
          lat: 40.7128,
          lng: -74.0060,
          date_start: '2024-01-01',
          time_start: '10:00',
          cover_image_url: 'https://res.cloudinary.com/test-cloud/image/upload/sample.jpg'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(isAllowedImageUrl).toHaveBeenCalledWith('https://res.cloudinary.com/test-cloud/image/upload/sample.jpg')
    })

    it('should reject invalid cover_image_url', async () => {
      const { isAllowedImageUrl } = await import('@/lib/images/validateImageUrl')
      vi.mocked(isAllowedImageUrl).mockReturnValue(false)

      const { POST } = await import('@/app/api/sales/route')
      
      const request = new NextRequest('http://localhost/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Sale',
          description: 'Test Description',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip_code: '12345',
          lat: 40.7128,
          lng: -74.0060,
          date_start: '2024-01-01',
          time_start: '10:00',
          cover_image_url: 'https://malicious-site.com/image.jpg'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid cover_image_url')
      expect(isAllowedImageUrl).toHaveBeenCalledWith('https://malicious-site.com/image.jpg')
    })

    it('should accept null cover_image_url', async () => {
      const { isAllowedImageUrl } = await import('@/lib/images/validateImageUrl')
      vi.mocked(isAllowedImageUrl).mockReturnValue(true)

      const { POST } = await import('@/app/api/sales/route')
      
      const request = new NextRequest('http://localhost/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Sale',
          description: 'Test Description',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip_code: '12345',
          lat: 40.7128,
          lng: -74.0060,
          date_start: '2024-01-01',
          time_start: '10:00',
          cover_image_url: null
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(isAllowedImageUrl).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/items', () => {
    it('should accept valid image_url', async () => {
      const { isAllowedImageUrl } = await import('@/lib/images/validateImageUrl')
      vi.mocked(isAllowedImageUrl).mockReturnValue(true)

      // Mock successful insert
      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: { id: 'test-item-id', name: 'Test Item' },
        error: null
      })

      const { POST } = await import('@/app/api/items/route')
      
      const request = new NextRequest('http://localhost/api/items', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Item',
          description: 'Test Description',
          price: 10.00,
          sale_id: 'test-sale-id',
          category: 'Electronics',
          condition: 'Good',
          image_url: 'https://res.cloudinary.com/test-cloud/image/upload/item.jpg'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.item).toBeDefined()
      expect(isAllowedImageUrl).toHaveBeenCalledWith('https://res.cloudinary.com/test-cloud/image/upload/item.jpg')
    })

    it('should reject invalid image_url', async () => {
      const { isAllowedImageUrl } = await import('@/lib/images/validateImageUrl')
      vi.mocked(isAllowedImageUrl).mockReturnValue(false)

      const { POST } = await import('@/app/api/items/route')
      
      const request = new NextRequest('http://localhost/api/items', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Item',
          description: 'Test Description',
          price: 10.00,
          sale_id: 'test-sale-id',
          category: 'Electronics',
          condition: 'Good',
          image_url: 'https://malicious-site.com/item.jpg'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid image_url')
      expect(isAllowedImageUrl).toHaveBeenCalledWith('https://malicious-site.com/item.jpg')
    })

    it('should accept null image_url', async () => {
      const { isAllowedImageUrl } = await import('@/lib/images/validateImageUrl')
      vi.mocked(isAllowedImageUrl).mockReturnValue(true)

      // Mock successful insert
      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: { id: 'test-item-id', name: 'Test Item' },
        error: null
      })

      const { POST } = await import('@/app/api/items/route')
      
      const request = new NextRequest('http://localhost/api/items', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Item',
          description: 'Test Description',
          price: 10.00,
          sale_id: 'test-sale-id',
          category: 'Electronics',
          condition: 'Good',
          image_url: null
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.item).toBeDefined()
      expect(isAllowedImageUrl).not.toHaveBeenCalled()
    })
  })

  describe('PUT /api/items', () => {
    it('should accept valid image_url on update', async () => {
      const { isAllowedImageUrl } = await import('@/lib/images/validateImageUrl')
      vi.mocked(isAllowedImageUrl).mockReturnValue(true)

      // Mock successful update
      mockSupabaseClient.from().update().eq().select().single.mockResolvedValue({
        data: { id: 'test-item-id', name: 'Updated Item' },
        error: null
      })

      const { PUT } = await import('@/app/api/items/route')
      
      const request = new NextRequest('http://localhost/api/items/test-item-id', {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Updated Item',
          description: 'Updated Description',
          price: 15.00,
          category: 'Electronics',
          condition: 'Excellent',
          image_url: 'https://res.cloudinary.com/test-cloud/image/upload/updated.jpg'
        })
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.item).toBeDefined()
      expect(isAllowedImageUrl).toHaveBeenCalledWith('https://res.cloudinary.com/test-cloud/image/upload/updated.jpg')
    })

    it('should reject invalid image_url on update', async () => {
      const { isAllowedImageUrl } = await import('@/lib/images/validateImageUrl')
      vi.mocked(isAllowedImageUrl).mockReturnValue(false)

      const { PUT } = await import('@/app/api/items/route')
      
      const request = new NextRequest('http://localhost/api/items/test-item-id', {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Updated Item',
          description: 'Updated Description',
          price: 15.00,
          category: 'Electronics',
          condition: 'Excellent',
          image_url: 'https://malicious-site.com/updated.jpg'
        })
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid image_url')
      expect(isAllowedImageUrl).toHaveBeenCalledWith('https://malicious-site.com/updated.jpg')
    })
  })
})
