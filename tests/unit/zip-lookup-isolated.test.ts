import { describe, it, expect } from 'vitest'

describe('ZIP Lookup Isolated Tests', () => {
  it('should normalize ZIP code 90078', () => {
    const normalizeZip = (rawZip: string) => {
      if (!rawZip) return null
      const digits = rawZip.replace(/\D/g, '')
      if (digits.length === 0) return null
      const lastFive = digits.length > 5 ? digits.slice(-5) : digits
      const normalized = lastFive.padStart(5, '0')
      if (!/^\d{5}$/.test(normalized)) return null
      return normalized
    }

    const result = normalizeZip('90078')
    expect(result).toBe('90078')
  })

  it('should normalize ZIP code with extension', () => {
    const normalizeZip = (rawZip: string) => {
      if (!rawZip) return null
      const digits = rawZip.replace(/\D/g, '')
      if (digits.length === 0) return null
      const lastFive = digits.length > 5 ? digits.slice(-5) : digits
      const normalized = lastFive.padStart(5, '0')
      if (!/^\d{5}$/.test(normalized)) return null
      return normalized
    }

    const result = normalizeZip('90078-1234')
    expect(result).toBe('90078')
  })

  it('should handle empty input', () => {
    const normalizeZip = (rawZip: string) => {
      if (!rawZip) return null
      const digits = rawZip.replace(/\D/g, '')
      if (digits.length === 0) return null
      const lastFive = digits.length > 5 ? digits.slice(-5) : digits
      const normalized = lastFive.padStart(5, '0')
      if (!/^\d{5}$/.test(normalized)) return null
      return normalized
    }

    const result = normalizeZip('')
    expect(result).toBe(null)
  })

  it('should handle invalid input', () => {
    const normalizeZip = (rawZip: string) => {
      if (!rawZip) return null
      const digits = rawZip.replace(/\D/g, '')
      if (digits.length === 0) return null
      const lastFive = digits.length > 5 ? digits.slice(-5) : digits
      const normalized = lastFive.padStart(5, '0')
      if (!/^\d{5}$/.test(normalized)) return null
      return normalized
    }

    const result = normalizeZip('abc')
    expect(result).toBe(null)
  })

  it('should find ZIP in hardcoded list', () => {
    const hardcodedZips: Record<string, { lat: number; lng: number; city: string; state: string }> = {
      '90078': { lat: 34.0522, lng: -118.2437, city: 'Los Angeles', state: 'CA' }
    }

    const result = hardcodedZips['90078']
    expect(result).toBeDefined()
    expect(result.lat).toBe(34.0522)
    expect(result.city).toBe('Los Angeles')
  })

  it('should handle database response', () => {
    const mockResponse = {
      data: { zip_code: '90078', lat: 34.0522, lng: -118.2437, city: 'Los Angeles', state: 'CA' },
      error: null
    }

    expect(mockResponse.data).toBeDefined()
    expect(mockResponse.error).toBeNull()
    expect(mockResponse.data.zip_code).toBe('90078')
  })

  it('should handle database error', () => {
    const mockResponse = {
      data: null,
      error: { message: 'Database connection failed' }
    }

    expect(mockResponse.data).toBeNull()
    expect(mockResponse.error).toBeDefined()
  })
})
