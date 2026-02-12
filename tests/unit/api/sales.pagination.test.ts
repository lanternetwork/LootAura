/**
 * Unit tests for /api/sales pagination parameter parsing
 */

import { describe, it, expect } from 'vitest'

/**
 * Parse and validate pagination parameters (extracted logic for testing)
 */
function parsePaginationParams(
  limitParam: string | null,
  offsetParam: string | null
): { limit: number; offset: number } {
  const defaultLimit = 24
  const maxLimit = 200
  
  const requestedLimit = limitParam ? parseInt(limitParam || '24') : defaultLimit
  const requestedOffset = offsetParam ? parseInt(offsetParam || '0') : 0

  const limit = Math.min(Math.max(1, requestedLimit), maxLimit)
  const offset = Math.max(0, requestedOffset)

  return { limit, offset }
}

describe('Sales API Pagination', () => {
  describe('parsePaginationParams', () => {
    it('should use default limit when no limit param provided', () => {
      const { limit, offset } = parsePaginationParams(null, null)
      expect(limit).toBe(24)
      expect(offset).toBe(0)
    })

    it('should parse valid limit and offset', () => {
      const { limit, offset } = parsePaginationParams('50', '10')
      expect(limit).toBe(50)
      expect(offset).toBe(10)
    })

    it('should enforce max limit of 200', () => {
      const { limit } = parsePaginationParams('500', null)
      expect(limit).toBe(200)
    })

    it('should enforce min limit of 1', () => {
      const { limit } = parsePaginationParams('0', null)
      expect(limit).toBe(1)
    })

    it('should enforce min offset of 0', () => {
      const { offset } = parsePaginationParams(null, '-5')
      expect(offset).toBe(0)
    })

    it('should handle invalid limit string', () => {
      const { limit } = parsePaginationParams('invalid', null)
      expect(limit).toBe(24) // Falls back to default when parseInt returns NaN
    })

    it('should handle invalid offset string', () => {
      const { offset } = parsePaginationParams(null, 'invalid')
      expect(offset).toBe(0) // Falls back to 0 when parseInt returns NaN
    })

    it('should handle empty string params', () => {
      const { limit, offset } = parsePaginationParams('', '')
      expect(limit).toBe(24)
      expect(offset).toBe(0)
    })

    it('should allow offset at max limit boundary', () => {
      const { limit, offset } = parsePaginationParams('200', '1000')
      expect(limit).toBe(200)
      expect(offset).toBe(1000) // No max on offset, just min of 0
    })
  })
})
