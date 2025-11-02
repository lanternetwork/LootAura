import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveDatePreset, dateRangesEqual } from '@/lib/shared/resolveDatePreset'

describe('resolveDatePreset', () => {
  let originalDate: DateConstructor

  beforeEach(() => {
    originalDate = global.Date
  })

  afterEach(() => {
    global.Date = originalDate
  })

  describe('with fixed dates for testing', () => {
    it('should resolve today correctly', () => {
      const fixedDate = new Date('2025-10-10T12:00:00Z') // Friday
      const result = resolveDatePreset('today', fixedDate)
      
      expect(result).toEqual({
        from: '2025-10-10',
        to: '2025-10-10'
      })
    })

    it('should resolve weekend correctly for Friday', () => {
      const friday = new Date('2025-10-10T12:00:00Z') // Friday
      const result = resolveDatePreset('weekend', friday)
      
      expect(result).toEqual({
        from: '2025-10-11', // Saturday
        to: '2025-10-12'    // Sunday
      })
    })

    it('should resolve weekend correctly for Saturday', () => {
      const saturday = new Date('2025-10-11T12:00:00Z') // Saturday
      const result = resolveDatePreset('weekend', saturday)
      
      expect(result).toEqual({
        from: '2025-10-11', // Saturday
        to: '2025-10-12'    // Sunday
      })
    })

    it('should resolve weekend correctly for Sunday', () => {
      const sunday = new Date('2025-10-12T12:00:00Z') // Sunday
      const result = resolveDatePreset('weekend', sunday)
      
      expect(result).toEqual({
        from: '2025-10-11', // Saturday
        to: '2025-10-12'    // Sunday
      })
    })

    it('should resolve next_weekend correctly for Friday', () => {
      const friday = new Date('2025-10-10T12:00:00Z') // Friday
      const result = resolveDatePreset('next_weekend', friday)
      
      expect(result).toEqual({
        from: '2025-10-18', // Next Saturday
        to: '2025-10-19'    // Next Sunday
      })
    })

    it('should resolve next_weekend correctly for Saturday', () => {
      const saturday = new Date('2025-10-11T12:00:00Z') // Saturday
      const result = resolveDatePreset('next_weekend', saturday)
      
      expect(result).toEqual({
        from: '2025-10-18', // Next Saturday
        to: '2025-10-19'    // Next Sunday
      })
    })

    it('should resolve next_weekend correctly for Sunday', () => {
      const sunday = new Date('2025-10-12T12:00:00Z') // Sunday
      const result = resolveDatePreset('next_weekend', sunday)
      
      expect(result).toEqual({
        from: '2025-10-18', // Next Saturday
        to: '2025-10-19'    // Next Sunday
      })
    })

    it('should return null for any preset', () => {
      const result = resolveDatePreset('any', new Date('2025-10-10T12:00:00Z'))
      expect(result).toBeNull()
    })

    it('should return null for undefined preset', () => {
      const result = resolveDatePreset(undefined, new Date('2025-10-10T12:00:00Z'))
      expect(result).toBeNull()
    })
  })

  describe('dateRangesEqual', () => {
    it('should return true for null ranges', () => {
      expect(dateRangesEqual(null, null)).toBe(true)
    })

    it('should return false when one is null', () => {
      expect(dateRangesEqual(null, { from: '2025-10-10', to: '2025-10-10' })).toBe(false)
      expect(dateRangesEqual({ from: '2025-10-10', to: '2025-10-10' }, null)).toBe(false)
    })

    it('should return true for equal ranges', () => {
      const range1 = { from: '2025-10-10', to: '2025-10-11' }
      const range2 = { from: '2025-10-10', to: '2025-10-11' }
      expect(dateRangesEqual(range1, range2)).toBe(true)
    })

    it('should return false for different ranges', () => {
      const range1 = { from: '2025-10-10', to: '2025-10-11' }
      const range2 = { from: '2025-10-11', to: '2025-10-12' }
      expect(dateRangesEqual(range1, range2)).toBe(false)
    })
  })
})
