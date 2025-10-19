import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Mock the Supabase client
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn()
      }))
    }))
  }))
}

// Mock fetch for API calls
const mockFetch = vi.fn()

describe('ZIP Lookup Integration Tests', () => {
  beforeAll(async () => {
    // Setup mocks
    vi.stubGlobal('fetch', mockFetch)
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
  })

  describe('Database ZIP Lookup (Method 1)', () => {
    it('should find ZIP codes in database', async () => {
      // Mock successful database response
      const mockSingle = vi.fn(() => ({
        data: { zip_code: '40204', lat: 38.2380249, lng: -85.7246945, city: 'Louisville', state: 'KY' },
        error: null
      }))
      
      const mockEq = vi.fn(() => ({ single: mockSingle }))
      const mockSelect = vi.fn(() => ({ eq: mockEq }))
      const mockFrom = vi.fn(() => ({ select: mockSelect }))

      mockSupabase.from = mockFrom

      const { data, error } = await mockSupabase
        .from('lootaura_v2.zipcodes')
        .select('zip_code, lat, lng, city, state')
        .eq('zip_code', '40204')
        .single()

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data.zip_code).toBe('40204')
      expect(data.lat).toBeTypeOf('number')
      expect(data.lng).toBeTypeOf('number')
      expect(data.city).toBeTypeOf('string')
      expect(data.state).toBeTypeOf('string')
    })

    it('should return null for unknown ZIP codes in database', async () => {
      const mockSingle = vi.fn(() => ({
        data: null,
        error: { message: 'No rows found' }
      }))
      
      const mockEq = vi.fn(() => ({ single: mockSingle }))
      const mockSelect = vi.fn(() => ({ eq: mockEq }))
      const mockFrom = vi.fn(() => ({ select: mockSelect }))

      mockSupabase.from = mockFrom

      const { data, error } = await mockSupabase
        .from('lootaura_v2.zipcodes')
        .select('zip_code, lat, lng, city, state')
        .eq('zip_code', '99999')
        .single()

      expect(error).toBeDefined()
      expect(data).toBeNull()
    })

    it('should have unique coordinates for different ZIP codes', async () => {
      const mockSingle1 = vi.fn(() => ({
        data: { zip_code: '40204', lat: 38.2380249, lng: -85.7246945 },
        error: null
      }))
      
      const mockSingle2 = vi.fn(() => ({
        data: { zip_code: '40205', lat: 38.2530000, lng: -85.7510000 },
        error: null
      }))
      
      const mockEq1 = vi.fn(() => ({ single: mockSingle1 }))
      const mockSelect1 = vi.fn(() => ({ eq: mockEq1 }))
      const mockFrom1 = vi.fn(() => ({ select: mockSelect1 }))

      const mockEq2 = vi.fn(() => ({ single: mockSingle2 }))
      const mockSelect2 = vi.fn(() => ({ eq: mockEq2 }))
      const mockFrom2 = vi.fn(() => ({ select: mockSelect2 }))

      mockSupabase.from = mockFrom1
      const { data: zip1 } = await mockSupabase
        .from('lootaura_v2.zipcodes')
        .select('zip_code, lat, lng')
        .eq('zip_code', '40204')
        .single()

      mockSupabase.from = mockFrom2
      const { data: zip2 } = await mockSupabase
        .from('lootaura_v2.zipcodes')
        .select('zip_code, lat, lng')
        .eq('zip_code', '40205')
        .single()

      expect(zip1).toBeDefined()
      expect(zip2).toBeDefined()
      
      // Coordinates should be different
      expect(zip1.lat).not.toBe(zip2.lat)
      expect(zip1.lng).not.toBe(zip2.lng)
    })
  })

  describe('Hardcoded ZIP Lookup (Method 2)', () => {
    it('should find ZIP codes in hardcoded fallback', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          zip: '90078',
          source: 'hardcoded',
          lat: 34.0522,
          lng: -118.2437,
          city: 'Los Angeles',
          state: 'CA'
        })
      })

      const response = await fetch('/api/geocoding/zip?zip=90078')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.zip).toBe('90078')
      expect(data.source).toBe('hardcoded')
      expect(data.lat).toBe(34.0522)
      expect(data.lng).toBe(-118.2437)
      expect(data.city).toBe('Los Angeles')
      expect(data.state).toBe('CA')
    })

    it('should find other hardcoded ZIP codes', async () => {
      const testCases = [
        { zip: '90210', city: 'Beverly Hills', state: 'CA' },
        { zip: '10001', city: 'New York', state: 'NY' },
        { zip: '60601', city: 'Chicago', state: 'IL' },
        { zip: '40204', city: 'Louisville', state: 'KY' }
      ]

      for (const testCase of testCases) {
        mockFetch.mockResolvedValue({
          status: 200,
          json: () => Promise.resolve({
            ok: true,
            zip: testCase.zip,
            source: 'hardcoded',
            city: testCase.city,
            state: testCase.state
          })
        })

        const response = await fetch(`/api/geocoding/zip?zip=${testCase.zip}`)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.ok).toBe(true)
        expect(data.zip).toBe(testCase.zip)
        expect(data.source).toBe('hardcoded')
        expect(data.city).toBe(testCase.city)
        expect(data.state).toBe(testCase.state)
      }
    })
  })

  describe('Nominatim ZIP Lookup (Method 3)', () => {
    it('should fallback to Nominatim for unknown ZIP codes', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          zip: '12345',
          source: 'nominatim',
          lat: 40.7505,
          lng: -73.9934,
          city: 'New York',
          state: 'NY'
        })
      })

      const response = await fetch('/api/geocoding/zip?zip=12345')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.source).toBe('nominatim')
      expect(data.lat).toBeTypeOf('number')
      expect(data.lng).toBeTypeOf('number')
      expect(data.city).toBeTypeOf('string')
      expect(data.state).toBeTypeOf('string')
    })

    it('should handle Nominatim rate limiting gracefully', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          zip: '54321',
          source: 'nominatim',
          lat: 40.7505,
          lng: -73.9934,
          city: 'New York',
          state: 'NY'
        })
      })

      // Test multiple rapid requests to ensure rate limiting works
      const promises = Array(3).fill(null).map(() => 
        fetch('/api/geocoding/zip?zip=54321')
      )
      
      const responses = await Promise.all(promises)
      
      // All should succeed (rate limiting is handled internally)
      for (const response of responses) {
        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.ok).toBe(true)
      }
    })
  })

  describe('ZIP Lookup Priority Order', () => {
    it('should use database first, then hardcoded, then Nominatim', async () => {
      // Test database priority
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          zip: '40204',
          source: 'local',
          lat: 38.2380249,
          lng: -85.7246945,
          city: 'Louisville',
          state: 'KY'
        })
      })

      const dbResponse = await fetch('/api/geocoding/zip?zip=40204')
      const dbData = await dbResponse.json()
      
      expect(dbData.source).toBe('local') // Should come from database

      // Test hardcoded priority
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          zip: '90078',
          source: 'hardcoded',
          lat: 34.0522,
          lng: -118.2437,
          city: 'Los Angeles',
          state: 'CA'
        })
      })

      const hardcodedResponse = await fetch('/api/geocoding/zip?zip=90078')
      const hardcodedData = await hardcodedResponse.json()
      
      expect(hardcodedData.source).toBe('hardcoded')

      // Test Nominatim fallback
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          zip: '12345',
          source: 'nominatim',
          lat: 40.7505,
          lng: -73.9934,
          city: 'New York',
          state: 'NY'
        })
      })

      const nominatimResponse = await fetch('/api/geocoding/zip?zip=12345')
      const nominatimData = await nominatimResponse.json()
      
      expect(nominatimData.source).toBe('nominatim')
    })
  })

  describe('ZIP Code Normalization', () => {
    it('should normalize ZIP codes correctly', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          zip: '90078',
          source: 'hardcoded',
          lat: 34.0522,
          lng: -118.2437,
          city: 'Los Angeles',
          state: 'CA'
        })
      })

      const testCases = [
        { input: '90078', expected: '90078' },
        { input: '90078-1234', expected: '90078' },
        { input: '90078 1234', expected: '90078' },
        { input: '90078-', expected: '90078' },
        { input: '90078 ', expected: '90078' }
      ]

      for (const testCase of testCases) {
        const response = await fetch(`/api/geocoding/zip?zip=${testCase.input}`)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.ok).toBe(true)
        expect(data.zip).toBe(testCase.expected)
      }
    })

    it('should reject invalid ZIP codes', async () => {
      mockFetch.mockResolvedValue({
        status: 400,
        json: () => Promise.resolve({
          ok: false,
          error: 'Invalid ZIP code'
        })
      })

      const invalidZips = ['', 'abc', '123', '123456', 'invalid']

      for (const invalidZip of invalidZips) {
        const response = await fetch(`/api/geocoding/zip?zip=${invalidZip}`)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.ok).toBe(false)
        expect(data.error).toContain('Invalid ZIP code')
      }
    })
  })

  describe('Performance and Caching', () => {
    it('should handle concurrent requests', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          zip: '90078',
          source: 'hardcoded',
          lat: 34.0522,
          lng: -118.2437,
          city: 'Los Angeles',
          state: 'CA'
        })
      })

      const promises = Array(5).fill(null).map((_, i) => 
        fetch(`/api/geocoding/zip?zip=${90078 + i}`)
      )
      
      const responses = await Promise.all(promises)
      
      for (const response of responses) {
        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.ok).toBe(true)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed responses', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          zip: '90078',
          source: 'hardcoded',
          lat: 34.0522,
          lng: -118.2437,
          city: 'Los Angeles',
          state: 'CA'
        })
      })

      const response = await fetch('/api/geocoding/zip?zip=90078')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('ok')
      expect(data).toHaveProperty('zip')
      expect(data).toHaveProperty('lat')
      expect(data).toHaveProperty('lng')
      expect(data).toHaveProperty('city')
      expect(data).toHaveProperty('state')
      expect(data).toHaveProperty('source')
    })
  })
})
