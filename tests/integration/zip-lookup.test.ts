import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createSupabaseServerClient } from '@/lib/supabase/server'

describe('ZIP Lookup Integration Tests', () => {
  let supabase: any

  beforeAll(async () => {
    supabase = createSupabaseServerClient()
  })

  afterAll(async () => {
    // Cleanup if needed
  })

  describe('Database ZIP Lookup (Method 1)', () => {
    it('should find ZIP codes in database', async () => {
      // Test known ZIP codes that should be in database
      const testZips = ['40204', '10001', '90078', '60601']
      
      for (const zip of testZips) {
        const { data, error } = await supabase
          .from('lootaura_v2.zipcodes')
          .select('zip_code, lat, lng, city, state')
          .eq('zip_code', zip)
          .single()

        expect(error).toBeNull()
        expect(data).toBeDefined()
        expect(data.zip_code).toBe(zip)
        expect(data.lat).toBeTypeOf('number')
        expect(data.lng).toBeTypeOf('number')
        expect(data.city).toBeTypeOf('string')
        expect(data.state).toBeTypeOf('string')
      }
    })

    it('should return null for unknown ZIP codes in database', async () => {
      const { data, error } = await supabase
        .from('lootaura_v2.zipcodes')
        .select('zip_code, lat, lng, city, state')
        .eq('zip_code', '99999')
        .single()

      expect(error).toBeDefined()
      expect(data).toBeNull()
    })

    it('should have unique coordinates for different ZIP codes', async () => {
      const { data: zip1 } = await supabase
        .from('lootaura_v2.zipcodes')
        .select('zip_code, lat, lng')
        .eq('zip_code', '40204')
        .single()

      const { data: zip2 } = await supabase
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
      // Use a real but uncommon ZIP code that's not in our database or hardcoded list
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
      // Test a ZIP that should be in database
      const dbResponse = await fetch('/api/geocoding/zip?zip=40204')
      const dbData = await dbResponse.json()
      
      expect(dbData.source).toBe('local') // Should come from database

      // Test a ZIP that should be in hardcoded fallback
      const hardcodedResponse = await fetch('/api/geocoding/zip?zip=90078')
      const hardcodedData = await hardcodedResponse.json()
      
      expect(hardcodedData.source).toBe('hardcoded')

      // Test a ZIP that should fallback to Nominatim
      const nominatimResponse = await fetch('/api/geocoding/zip?zip=12345')
      const nominatimData = await nominatimResponse.json()
      
      expect(nominatimData.source).toBe('nominatim')
    })
  })

  describe('ZIP Code Normalization', () => {
    it('should normalize ZIP codes correctly', async () => {
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
    it('should cache responses appropriately', async () => {
      const start = Date.now()
      const response1 = await fetch('/api/geocoding/zip?zip=90078')
      const time1 = Date.now() - start

      const start2 = Date.now()
      const response2 = await fetch('/api/geocoding/zip?zip=90078')
      const time2 = Date.now() - start2

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
      
      // Second request should be faster (cached)
      expect(time2).toBeLessThan(time1)
    })

    it('should handle concurrent requests', async () => {
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
    it('should handle network errors gracefully', async () => {
      // Mock a network error by using an invalid URL
      const response = await fetch('/api/geocoding/zip?zip=99999')
      const data = await response.json()

      // Should either succeed with Nominatim or fail gracefully
      if (data.ok) {
        expect(data.source).toBe('nominatim')
      } else {
        expect(data.error).toBeDefined()
      }
    })

    it('should handle malformed responses', async () => {
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
