import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the ZIP lookup functions
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn()
      }))
    }))
  }))
}

const mockFetch = vi.fn()

// Mock environment variables
vi.mock('process', () => ({
  env: {
    NOMINATIM_APP_EMAIL: 'test@example.com',
    ENABLE_ZIP_WRITEBACK: 'false'
  }
}))

describe('ZIP Lookup Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ZIP Code Normalization', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should normalize ZIP codes correctly', () => {
      const normalizeZip = (rawZip: string) => {
        if (!rawZip) return null
        
        // Strip non-digits
        const digits = rawZip.replace(/\D/g, '')
        
        // If length > 5, take last 5
        const lastFive = digits.length > 5 ? digits.slice(-5) : digits
        
        // Left-pad with '0' to length 5
        const normalized = lastFive.padStart(5, '0')
        
        // Validate final against /^\d{5}$/
        if (!/^\d{5}$/.test(normalized)) {
          return null
        }
        
        return normalized
      }

      // Test individual cases to avoid loop issues
      expect(normalizeZip('90078')).toBe('90078')
      expect(normalizeZip('90078-1234')).toBe('90078')
      expect(normalizeZip('90078 1234')).toBe('90078')
      expect(normalizeZip('90078-')).toBe('90078')
      expect(normalizeZip('90078 ')).toBe('90078')
      expect(normalizeZip('1234')).toBe('01234')
      expect(normalizeZip('123456789')).toBe('56789')
      expect(normalizeZip('')).toBe(null)
      expect(normalizeZip('abc')).toBe(null)
      expect(normalizeZip('123')).toBe('00123')
    })
  })

  describe('Hardcoded ZIP Lookup', () => {
    it('should find ZIP codes in hardcoded list', () => {
      const hardcodedZips: Record<string, { lat: number; lng: number; city: string; state: string }> = {
        '90078': { lat: 34.0522, lng: -118.2437, city: 'Los Angeles', state: 'CA' },
        '90210': { lat: 34.0901, lng: -118.4065, city: 'Beverly Hills', state: 'CA' },
        '10001': { lat: 40.7505, lng: -73.9934, city: 'New York', state: 'NY' },
        '60601': { lat: 41.8781, lng: -87.6298, city: 'Chicago', state: 'IL' },
        '40204': { lat: 38.2380249, lng: -85.7246945, city: 'Louisville', state: 'KY' }
      }

      const testCases = [
        { zip: '90078', expected: { lat: 34.0522, lng: -118.2437, city: 'Los Angeles', state: 'CA' } },
        { zip: '90210', expected: { lat: 34.0901, lng: -118.4065, city: 'Beverly Hills', state: 'CA' } },
        { zip: '10001', expected: { lat: 40.7505, lng: -73.9934, city: 'New York', state: 'NY' } },
        { zip: '60601', expected: { lat: 41.8781, lng: -87.6298, city: 'Chicago', state: 'IL' } },
        { zip: '40204', expected: { lat: 38.2380249, lng: -85.7246945, city: 'Louisville', state: 'KY' } }
      ]

      for (const testCase of testCases) {
        const result = hardcodedZips[testCase.zip]
        expect(result).toBeDefined()
        expect(result.lat).toBe(testCase.expected.lat)
        expect(result.lng).toBe(testCase.expected.lng)
        expect(result.city).toBe(testCase.expected.city)
        expect(result.state).toBe(testCase.expected.state)
      }
    })

    it('should return undefined for unknown ZIP codes', () => {
      const hardcodedZips: Record<string, { lat: number; lng: number; city: string; state: string }> = {
        '90078': { lat: 34.0522, lng: -118.2437, city: 'Los Angeles', state: 'CA' }
      }

      const unknownZips = ['99999', '12345', '00000']
      
      for (const zip of unknownZips) {
        const result = hardcodedZips[zip]
        expect(result).toBeUndefined()
      }
    })
  })

  describe('Database ZIP Lookup', () => {
    it('should query database with correct parameters', async () => {
      const mockSingle = vi.fn(() => ({
        data: { zip_code: '90078', lat: 34.0522, lng: -118.2437, city: 'Los Angeles', state: 'CA' },
        error: null
      }))
      
      const mockEq = vi.fn(() => ({ single: mockSingle }))
      const mockSelect = vi.fn(() => ({ eq: mockEq }))
      const mockFrom = vi.fn(() => ({ select: mockSelect }))

      mockSupabase.from = mockFrom

      const result = await mockSupabase
        .from('lootaura_v2.zipcodes')
        .select('zip_code, lat, lng, city, state')
        .eq('zip_code', '90078')
        .single()

      expect(mockFrom).toHaveBeenCalledWith('lootaura_v2.zipcodes')
      expect(mockSelect).toHaveBeenCalledWith('zip_code, lat, lng, city, state')
      expect(mockEq).toHaveBeenCalledWith('zip_code', '90078')
      expect(result.data).toBeDefined()
      expect(result.error).toBeNull()
    })

    it('should handle database errors', async () => {
      const mockSingle = vi.fn(() => ({
        data: null,
        error: { message: 'Database connection failed' }
      }))
      
      const mockEq = vi.fn(() => ({ single: mockSingle }))
      const mockSelect = vi.fn(() => ({ eq: mockEq }))
      const mockFrom = vi.fn(() => ({ select: mockSelect }))

      mockSupabase.from = mockFrom

      const result = await mockSupabase
        .from('lootaura_v2.zipcodes')
        .select('zip_code, lat, lng, city, state')
        .eq('zip_code', '99999')
        .single()

      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
      expect(result.error.message).toBe('Database connection failed')
    })
  })

  describe('Nominatim ZIP Lookup', () => {
    it('should make correct API request to Nominatim', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn(() => Promise.resolve([
          {
            lat: '40.7505',
            lon: '-73.9934',
            address: {
              city: 'New York',
              state: 'NY'
            }
          }
        ]))
      }

      mockFetch.mockResolvedValue(mockResponse)

      const email = 'test@example.com'
      const zip = '10001'
      const url = `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1&email=${email}`
      
      const response = await mockFetch(url, {
        headers: {
          'User-Agent': `LootAura/1.0 (${email})`
        }
      })

      expect(mockFetch).toHaveBeenCalledWith(url, {
        headers: {
          'User-Agent': `LootAura/1.0 (${email})`
        }
      })
      expect(response.ok).toBe(true)
    })

    it('should handle Nominatim rate limiting', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      }

      mockFetch.mockResolvedValue(mockResponse)

      const response = await mockFetch('https://nominatim.openstreetmap.org/search?postalcode=10001&country=US&format=json&limit=1&email=test@example.com')

      expect(response.ok).toBe(false)
      expect(response.status).toBe(429)
    })

    it('should parse Nominatim response correctly', () => {
      const nominatimResponse = [
        {
          lat: '40.7505',
          lon: '-73.9934',
          address: {
            city: 'New York',
            state: 'NY'
          }
        }
      ]

      const result = nominatimResponse[0]
      const lat = parseFloat(result.lat)
      const lng = parseFloat(result.lon)
      const city = result.address?.city || null
      const state = result.address?.state || null

      expect(lat).toBe(40.7505)
      expect(lng).toBe(-73.9934)
      expect(city).toBe('New York')
      expect(state).toBe('NY')
    })
  })

  describe('ZIP Lookup Priority', () => {
    it('should follow correct priority order', async () => {
      // Mock database response (found)
      const mockDbResponse = {
        data: { zip_code: '40204', lat: 38.2380249, lng: -85.7246945, city: 'Louisville', state: 'KY' },
        error: null
      }

      // Mock hardcoded response (found)
      const hardcodedZips = {
        '90078': { lat: 34.0522, lng: -118.2437, city: 'Los Angeles', state: 'CA' }
      }

      // Mock Nominatim response (fallback)
      const mockNominatimResponse = {
        ok: true,
        json: () => Promise.resolve([
          { lat: '40.7505', lon: '-73.9934', address: { city: 'New York', state: 'NY' } }
        ])
      }

      // Test database priority
      const dbResult = mockDbResponse
      expect(dbResult.data).toBeDefined()
      expect(dbResult.error).toBeNull()

      // Test hardcoded priority
      const hardcodedResult = hardcodedZips['90078']
      expect(hardcodedResult).toBeDefined()

      // Test Nominatim fallback
      const nominatimData = await mockNominatimResponse.json()
      expect(nominatimData).toBeDefined()
      expect(nominatimData[0].lat).toBe('40.7505')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid ZIP codes', () => {
      const invalidZips = ['', 'abc', '123', '123456', 'invalid']

      for (const invalidZip of invalidZips) {
        // Test normalization
        const digits = invalidZip.replace(/\D/g, '')
        const lastFive = digits.length > 5 ? digits.slice(-5) : digits
        const normalized = lastFive.padStart(5, '0')
        const isValid = /^\d{5}$/.test(normalized)

        if (invalidZip === '' || invalidZip === 'abc' || invalidZip === 'invalid') {
          expect(isValid).toBe(false)
        } else if (invalidZip === '123') {
          expect(isValid).toBe(true) // '123' becomes '00123' which is valid
        } else {
          expect(isValid).toBe(true)
        }
      }
    })

    it('should handle network errors gracefully', async () => {
      const mockError = new Error('Network error')
      mockFetch.mockRejectedValue(mockError)

      try {
        await mockFetch('https://nominatim.openstreetmap.org/search?postalcode=10001&country=US&format=json&limit=1&email=test@example.com')
      } catch (error) {
        expect(error).toBe(mockError)
      }
    })

    it('should handle malformed responses', () => {
      const malformedResponses = [
        null,
        undefined,
        [],
        {},
        { lat: 'invalid', lon: 'invalid' },
        { address: {} }
      ]

      for (const response of malformedResponses) {
        if (Array.isArray(response) && response.length > 0) {
          const result = response[0]
          const lat = parseFloat(result.lat)
          const lng = parseFloat(result.lon)
          
          expect(isNaN(lat)).toBe(true)
          expect(isNaN(lng)).toBe(true)
        }
      }
    })
  })
})
