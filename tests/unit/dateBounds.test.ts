import { describe, it, expect } from 'vitest'
import { 
  parseDateBounds, 
  checkDateOverlap, 
  validateDateRange,
  toUtcStartOfDay,
  toUtcEndOfDay 
} from '@/lib/shared/dateBounds'

describe('Date Bounds Helper', () => {
  describe('parseDateBounds', () => {
    it('should return null when no dates provided', () => {
      expect(parseDateBounds()).toBeNull()
      expect(parseDateBounds(undefined, undefined)).toBeNull()
    })

    it('should parse single date correctly', () => {
      const bounds = parseDateBounds('2024-01-15')
      expect(bounds).not.toBeNull()
      expect(bounds!.start.toISOString()).toBe('2024-01-15T00:00:00.000Z')
      expect(bounds!.end.toISOString()).toBe('2024-01-15T23:59:59.999Z')
    })

    it('should parse date range correctly', () => {
      const bounds = parseDateBounds('2024-01-15', '2024-01-20')
      expect(bounds).not.toBeNull()
      expect(bounds!.start.toISOString()).toBe('2024-01-15T00:00:00.000Z')
      expect(bounds!.end.toISOString()).toBe('2024-01-20T23:59:59.999Z')
    })

    it('should handle only from date', () => {
      const bounds = parseDateBounds('2024-01-15')
      expect(bounds).not.toBeNull()
      expect(bounds!.start.toISOString()).toBe('2024-01-15T00:00:00.000Z')
      expect(bounds!.end.toISOString()).toBe('2024-01-15T23:59:59.999Z')
    })

    it('should handle only to date', () => {
      const bounds = parseDateBounds(undefined, '2024-01-20')
      expect(bounds).not.toBeNull()
      expect(bounds!.start.toISOString()).toBe('1970-01-01T00:00:00.000Z') // Unix epoch
      expect(bounds!.end.toISOString()).toBe('2024-01-20T23:59:59.999Z')
    })
  })

  describe('checkDateOverlap', () => {
    const bounds = { start: new Date('2024-01-15T00:00:00.000Z'), end: new Date('2024-01-20T23:59:59.999Z') }

    it('should return false for sales with no date info', () => {
      expect(checkDateOverlap(null, null, bounds)).toBe(false)
    })

    it('should handle single-day sales (start=end)', () => {
      const saleStart = new Date('2024-01-18T10:00:00.000Z')
      expect(checkDateOverlap(saleStart, null, bounds)).toBe(true)
    })

    it('should handle open-ended sales (no end date)', () => {
      const saleStart = new Date('2024-01-18T10:00:00.000Z')
      expect(checkDateOverlap(saleStart, null, bounds)).toBe(true)
    })

    it('should handle sales that start before and end within bounds', () => {
      const saleStart = new Date('2024-01-10T10:00:00.000Z')
      const saleEnd = new Date('2024-01-18T10:00:00.000Z')
      expect(checkDateOverlap(saleStart, saleEnd, bounds)).toBe(true)
    })

    it('should handle sales that start within and end after bounds', () => {
      const saleStart = new Date('2024-01-18T10:00:00.000Z')
      const saleEnd = new Date('2024-01-25T10:00:00.000Z')
      expect(checkDateOverlap(saleStart, saleEnd, bounds)).toBe(true)
    })

    it('should handle sales completely within bounds', () => {
      const saleStart = new Date('2024-01-16T10:00:00.000Z')
      const saleEnd = new Date('2024-01-18T10:00:00.000Z')
      expect(checkDateOverlap(saleStart, saleEnd, bounds)).toBe(true)
    })

    it('should handle sales completely before bounds', () => {
      const saleStart = new Date('2024-01-10T10:00:00.000Z')
      const saleEnd = new Date('2024-01-14T10:00:00.000Z')
      expect(checkDateOverlap(saleStart, saleEnd, bounds)).toBe(false)
    })

    it('should handle sales completely after bounds', () => {
      const saleStart = new Date('2024-01-21T10:00:00.000Z')
      const saleEnd = new Date('2024-01-25T10:00:00.000Z')
      expect(checkDateOverlap(saleStart, saleEnd, bounds)).toBe(false)
    })

    it('should handle sales that touch bounds exactly', () => {
      const saleStart = new Date('2024-01-15T00:00:00.000Z')
      const saleEnd = new Date('2024-01-20T23:59:59.999Z')
      expect(checkDateOverlap(saleStart, saleEnd, bounds)).toBe(true)
    })
  })

  describe('validateDateRange', () => {
    it('should return valid for no dates', () => {
      expect(validateDateRange()).toEqual({ valid: true })
      expect(validateDateRange(undefined, undefined)).toEqual({ valid: true })
    })

    it('should return valid for single date', () => {
      expect(validateDateRange('2024-01-15')).toEqual({ valid: true })
      expect(validateDateRange(undefined, '2024-01-15')).toEqual({ valid: true })
    })

    it('should return valid for proper date range', () => {
      expect(validateDateRange('2024-01-15', '2024-01-20')).toEqual({ valid: true })
    })

    it('should return invalid for inverted dates', () => {
      const result = validateDateRange('2024-01-20', '2024-01-15')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Start date must be before end date')
    })

    it('should return invalid for malformed dates', () => {
      const result1 = validateDateRange('invalid-date', '2024-01-15')
      expect(result1.valid).toBe(false)
      expect(result1.error).toBe('Invalid date format')

      const result2 = validateDateRange('2024-01-15', 'invalid-date')
      expect(result2.valid).toBe(false)
      expect(result2.error).toBe('Invalid date format')
    })
  })

  describe('UTC conversion helpers', () => {
    it('should convert to UTC start of day', () => {
      const result = toUtcStartOfDay('2024-01-15')
      expect(result.toISOString()).toBe('2024-01-15T00:00:00.000Z')
    })

    it('should convert to UTC end of day', () => {
      const result = toUtcEndOfDay('2024-01-15')
      expect(result.toISOString()).toBe('2024-01-15T23:59:59.999Z')
    })
  })
})
