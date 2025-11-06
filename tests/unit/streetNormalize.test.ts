import { describe, it, expect } from 'vitest'
import { normalizeStreetName, buildStreetRegex, parseDigitsStreetQuery } from '@/lib/geo/streetNormalize'

describe('streetNormalize', () => {
  describe('normalizeStreetName', () => {
    it('should lowercase and strip punctuation', () => {
      expect(normalizeStreetName('Main St.')).toBe('main street')
      expect(normalizeStreetName('Oak Ave!')).toBe('oak avenue')
    })

    it('should expand street type abbreviations', () => {
      expect(normalizeStreetName('Main St')).toBe('main street')
      expect(normalizeStreetName('Oak Ave')).toBe('oak avenue')
      expect(normalizeStreetName('Park Blvd')).toBe('park boulevard')
      expect(normalizeStreetName('Highway 1')).toBe('highway 1')
      expect(normalizeStreetName('Parkway Dr')).toBe('parkway drive')
    })

    it('should expand directional abbreviations', () => {
      expect(normalizeStreetName('N Main St')).toBe('north main street')
      expect(normalizeStreetName('S Oak Ave')).toBe('south oak avenue')
      expect(normalizeStreetName('NE Park Blvd')).toBe('northeast park boulevard')
      expect(normalizeStreetName('SW Highway')).toBe('southwest highway')
    })

    it('should collapse whitespace', () => {
      expect(normalizeStreetName('Main   St')).toBe('main street')
      expect(normalizeStreetName('  Oak  Ave  ')).toBe('oak avenue')
    })

    it('should handle mixed case', () => {
      expect(normalizeStreetName('MAIN ST')).toBe('main street')
      expect(normalizeStreetName('Main St')).toBe('main street')
      expect(normalizeStreetName('main st')).toBe('main street')
    })
  })

  describe('buildStreetRegex', () => {
    it('should build token-AND regex pattern from normalized street', () => {
      const pattern = buildStreetRegex('main street')
      // Pattern should match all tokens: (?i).*\btoken1\b.*\btoken2\b.*
      expect(pattern).toMatch(/\(\?i\)/)
      expect(pattern).toContain('main')
      expect(pattern).toContain('street')
    })

    it('should escape special regex characters', () => {
      const pattern = buildStreetRegex('park (north)')
      expect(pattern).toContain('\\(')
      expect(pattern).toContain('\\)')
    })

    it('should handle single token', () => {
      const pattern = buildStreetRegex('highway')
      expect(pattern).toMatch(/\(\?i\)/)
      expect(pattern).toContain('highway')
    })

    it('should handle empty string', () => {
      const pattern = buildStreetRegex('')
      expect(pattern).toBe('.*')
    })

    it('should support abbreviations in token pattern', () => {
      const pattern = buildStreetRegex('main highway')
      // Should support both "highway" and "hwy"
      expect(pattern).toContain('main')
      expect(pattern).toContain('highway')
    })
  })

  describe('parseDigitsStreetQuery', () => {
    it('should parse valid digits+street query', () => {
      const result = parseDigitsStreetQuery('5001 Main St')
      expect(result).toEqual({
        num: '5001',
        street: 'Main St'
      })
    })

    it('should handle 1-8 digit prefixes', () => {
      expect(parseDigitsStreetQuery('1 Main St')).toEqual({ num: '1', street: 'Main St' })
      expect(parseDigitsStreetQuery('12345678 Main St')).toEqual({ num: '12345678', street: 'Main St' })
    })

    it('should return null for numeric-only query', () => {
      expect(parseDigitsStreetQuery('5001')).toBeNull()
    })

    it('should return null for query without digits', () => {
      expect(parseDigitsStreetQuery('Main St')).toBeNull()
    })

    it('should return null for query without street', () => {
      expect(parseDigitsStreetQuery('5001 ')).toBeNull()
    })

    it('should handle street names with spaces', () => {
      const result = parseDigitsStreetQuery('5001 Main Street')
      expect(result).toEqual({
        num: '5001',
        street: 'Main Street'
      })
    })
  })
})

