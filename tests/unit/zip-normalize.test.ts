import { describe, it, expect } from 'vitest'

// ZIP normalization function (copied from component for testing)
function normalizeZip(rawZip: string): string | null {
  if (!rawZip) return null
  
  // Strip non-digits
  const digits = rawZip.replace(/\D/g, '')
  
  // Reject if less than 5 digits (before padding)
  if (digits.length < 5) return null
  
  // If length > 5, take last 5
  const lastFive = digits.length > 5 ? digits.slice(-5) : digits
  
  // Validate final against /^\d{5}$/
  if (!/^\d{5}$/.test(lastFive)) {
    return null
  }
  
  // Reject all zeros
  if (lastFive === '00000') {
    return null
  }
  
  return lastFive
}

describe('ZIP Normalization', () => {
  it('should normalize leading zeros', () => {
    expect(normalizeZip(' 02115 ')).toBe('02115')
    expect(normalizeZip('02115')).toBe('02115')
    expect(normalizeZip('00501')).toBe('00501')
  })

  it('should take last 5 digits when too long', () => {
    expect(normalizeZip('123456')).toBe('23456')
    expect(normalizeZip('123456789')).toBe('56789')
    expect(normalizeZip('987654321')).toBe('54321')
  })

  it('should handle mixed characters', () => {
    // Our normalizer strips non-digits then validates length >= 5 and truncates to last 5.
    expect(normalizeZip('abc123def')).toBe(null)
    expect(normalizeZip('123-45')).toBe('12345')
    expect(normalizeZip('123.45')).toBe('12345')
    expect(normalizeZip('123 45')).toBe('12345')
  })

  it('should return null for invalid input', () => {
    expect(normalizeZip('')).toBe(null)
    expect(normalizeZip('12')).toBe(null)
    expect(normalizeZip('1234')).toBe(null)
  })

  it('should handle edge cases', () => {
    expect(normalizeZip('00000')).toBe(null)
    expect(normalizeZip('99999')).toBe('99999')
    expect(normalizeZip('12345')).toBe('12345')
  })
})
