import { describe, it, expect } from 'vitest'
import { 
  sanitizeHtml, 
  sanitizeText, 
  sanitizeUrl, 
  sanitizeEmail, 
  sanitizePhone, 
  sanitizeAddress, 
  sanitizeTags,
  sanitizeSearchQuery,
  sanitizePostgrestIlikeQuery,
  isValidUuid,
  isValidLatitude,
  isValidLongitude,
  isValidPrice,
  isValidDate
} from '@/lib/sanitize'

describe('sanitizeHtml', () => {
  it('should remove dangerous HTML tags', () => {
    const input = '<script>alert("xss")</script><p>Safe content</p>'
    const result = sanitizeHtml(input)
    expect(result).toBe('<p>Safe content</p>')
  })

  it('should preserve allowed tags', () => {
    const input = '<p>Safe <strong>content</strong> with <em>emphasis</em></p>'
    const result = sanitizeHtml(input)
    expect(result).toBe('<p>Safe <strong>content</strong> with <em>emphasis</em></p>')
  })

  it('should strip HTML when stripHtml is true', () => {
    const input = '<p>Safe <strong>content</strong></p>'
    const result = sanitizeHtml(input, { stripHtml: true })
    expect(result).toBe('Safe content')
  })

  it('should truncate long content', () => {
    const input = 'a'.repeat(15000)
    const result = sanitizeHtml(input, { maxLength: 100 })
    expect(result.length).toBe(100)
  })
})

describe('sanitizeText', () => {
  it('should remove HTML tags', () => {
    const input = '<p>Safe <strong>content</strong></p>'
    const result = sanitizeText(input)
    expect(result).toBe('Safe content')
  })

  it('should normalize whitespace', () => {
    const input = '  Multiple   spaces   and\ttabs  '
    const result = sanitizeText(input)
    expect(result).toBe('Multiple spaces and tabs')
  })

  it('should truncate long text', () => {
    const input = 'a'.repeat(2000)
    const result = sanitizeText(input, 100)
    expect(result.length).toBe(100)
  })
})

describe('sanitizeUrl', () => {
  it('should allow valid HTTP URLs', () => {
    const input = 'https://example.com'
    const result = sanitizeUrl(input)
    expect(result).toBe('https://example.com')
  })

  it('should reject JavaScript URLs', () => {
    const input = 'javascript:alert("xss")'
    const result = sanitizeUrl(input)
    expect(result).toBe('')
  })

  it('should reject data URLs', () => {
    const input = 'data:text/html,<script>alert("xss")</script>'
    const result = sanitizeUrl(input)
    expect(result).toBe('')
  })

  it('should reject invalid URLs', () => {
    const input = 'not-a-url'
    const result = sanitizeUrl(input)
    expect(result).toBe('')
  })
})

describe('sanitizeEmail', () => {
  it('should validate and sanitize valid emails', () => {
    const input = '  USER@EXAMPLE.COM  '
    const result = sanitizeEmail(input)
    expect(result).toBe('user@example.com')
  })

  it('should reject invalid emails', () => {
    const input = 'not-an-email'
    const result = sanitizeEmail(input)
    expect(result).toBe('')
  })

  it('should reject emails with suspicious content', () => {
    const input = 'user@example.com<script>alert("xss")</script>'
    const result = sanitizeEmail(input)
    expect(result).toBe('')
  })
})

describe('sanitizePhone', () => {
  it('should sanitize phone numbers', () => {
    const input = '+1 (555) 123-4567'
    const result = sanitizePhone(input)
    expect(result).toBe('+15551234567')
  })

  it('should reject invalid phone numbers', () => {
    const input = '123'
    const result = sanitizePhone(input)
    expect(result).toBe('')
  })

  it('should handle international numbers', () => {
    const input = '+44 20 7946 0958'
    const result = sanitizePhone(input)
    expect(result).toBe('+442079460958')
  })
})

describe('sanitizeTags', () => {
  it('should sanitize and limit tags', () => {
    const input = ['  Tag1  ', '<script>alert("xss")</script>', 'Tag2', 'a'.repeat(100)]
    const result = sanitizeTags(input)
    expect(result).toEqual(['Tag1', 'Tag2'])
  })

  it('should limit number of tags', () => {
    const input = Array.from({ length: 15 }, (_, i) => `Tag${i}`)
    const result = sanitizeTags(input)
    expect(result.length).toBe(10)
  })
})

describe('sanitizeSearchQuery', () => {
  it('should sanitize search queries', () => {
    const input = '<script>alert("xss")</script>garage sale'
    const result = sanitizeSearchQuery(input)
    expect(result).toBe('garage sale')
  })

  it('should remove dangerous characters', () => {
    const input = 'garage sale <>&"\'' 
    const result = sanitizeSearchQuery(input)
    expect(result).toBe('garage sale')
  })
})

describe('sanitizePostgrestIlikeQuery', () => {
  it('should handle benign queries', () => {
    const input = 'garage sale'
    const result = sanitizePostgrestIlikeQuery(input)
    expect(result).toBe('garage sale')
  })

  it('should escape PostgreSQL wildcards', () => {
    const input = 'test%value_here'
    const result = sanitizePostgrestIlikeQuery(input)
    expect(result).toBe('test%%value__here')
  })

  it('should remove commas that break .or() syntax', () => {
    const input = 'test,value'
    const result = sanitizePostgrestIlikeQuery(input)
    expect(result).toBe('testvalue')
  })

  it('should remove parentheses that break filter syntax', () => {
    const input = 'test(value)'
    const result = sanitizePostgrestIlikeQuery(input)
    expect(result).toBe('testvalue')
  })

  it('should remove quotes that break string boundaries', () => {
    const input = "test'value\"here"
    const result = sanitizePostgrestIlikeQuery(input)
    expect(result).toBe('testvaluehere')
  })

  it('should handle malicious injection attempts', () => {
    const input = 'a,b) or ('
    const result = sanitizePostgrestIlikeQuery(input)
    expect(result).toBe('ab or')
  })

  it('should enforce max length', () => {
    const input = 'a'.repeat(300)
    const result = sanitizePostgrestIlikeQuery(input, 200)
    expect(result.length).toBe(200)
  })

  it('should remove control characters', () => {
    const input = 'test\x00\x1F\x7Fvalue'
    const result = sanitizePostgrestIlikeQuery(input)
    expect(result).toBe('testvalue')
  })

  it('should handle empty string', () => {
    const result = sanitizePostgrestIlikeQuery('')
    expect(result).toBe('')
  })

  it('should handle null/undefined', () => {
    expect(sanitizePostgrestIlikeQuery(null as any)).toBe('')
    expect(sanitizePostgrestIlikeQuery(undefined as any)).toBe('')
  })

  it('should trim whitespace', () => {
    const input = '  test value  '
    const result = sanitizePostgrestIlikeQuery(input)
    expect(result).toBe('test value')
  })
})

describe('validation helpers', () => {
  it('should validate UUIDs', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isValidUuid('not-a-uuid')).toBe(false)
  })

  it('should validate latitudes', () => {
    expect(isValidLatitude(45.5)).toBe(true)
    expect(isValidLatitude(91)).toBe(false)
    expect(isValidLatitude(-91)).toBe(false)
  })

  it('should validate longitudes', () => {
    expect(isValidLongitude(-122.5)).toBe(true)
    expect(isValidLongitude(181)).toBe(false)
    expect(isValidLongitude(-181)).toBe(false)
  })

  it('should validate prices', () => {
    expect(isValidPrice(100)).toBe(true)
    expect(isValidPrice(-1)).toBe(false)
    expect(isValidPrice(1000001)).toBe(false)
  })

  it('should validate dates', () => {
    expect(isValidDate('2023-12-25')).toBe(true)
    expect(isValidDate('invalid-date')).toBe(false)
  })
})
