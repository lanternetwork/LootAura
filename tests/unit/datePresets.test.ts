import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildDatePresets, getDatePresetById, isKnownPreset } from '@/lib/shared/datePresets'

describe('datePresets', () => {
  let originalDate: DateConstructor

  beforeEach(() => {
    // Save original Date constructor
    originalDate = global.Date
  })

  afterEach(() => {
    // Restore original Date constructor
    global.Date = originalDate
  })

  describe('buildDatePresets', () => {
    it('should return presets in correct order: today, thursday, friday, saturday, sunday, this_weekend', () => {
      // Mock Wednesday, 2025-01-01 (day 3)
      const mockDate = new originalDate('2025-01-01T12:00:00Z') // Wednesday
      global.Date = class extends originalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(mockDate.getTime())
          } else {
            super(...args)
          }
        }
        static now = () => mockDate.getTime()
      } as any

      const presets = buildDatePresets()

      expect(presets.length).toBe(6)
      expect(presets[0].id).toBe('today')
      expect(presets[1].id).toBe('thursday')
      expect(presets[2].id).toBe('friday')
      expect(presets[3].id).toBe('saturday')
      expect(presets[4].id).toBe('sunday')
      expect(presets[5].id).toBe('this_weekend')
    })

    it('should return correct dates when today is Wednesday', () => {
      // Mock Wednesday, 2025-01-01 (day 3)
      const mockDate = new originalDate('2025-01-01T12:00:00Z') // Wednesday
      global.Date = class extends originalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(mockDate.getTime())
          } else {
            super(...args)
          }
        }
        static now = () => mockDate.getTime()
      } as any

      const presets = buildDatePresets()

      expect(presets[0]).toEqual({ id: 'today', label: 'Today', start: '2025-01-01', end: '2025-01-01' })
      expect(presets[1]).toEqual({ id: 'thursday', label: 'Thursday', start: '2025-01-02', end: '2025-01-02' })
      expect(presets[2]).toEqual({ id: 'friday', label: 'Friday', start: '2025-01-03', end: '2025-01-03' })
      expect(presets[3]).toEqual({ id: 'saturday', label: 'Saturday', start: '2025-01-04', end: '2025-01-04' })
      expect(presets[4]).toEqual({ id: 'sunday', label: 'Sunday', start: '2025-01-05', end: '2025-01-05' })
      expect(presets[5]).toEqual({ id: 'this_weekend', label: 'This weekend', start: '2025-01-04', end: '2025-01-05' })
    })

    it('should return correct dates when today is Saturday', () => {
      // Mock Saturday, 2025-01-04 (day 6)
      const mockDate = new originalDate('2025-01-04T12:00:00Z') // Saturday
      global.Date = class extends originalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(mockDate.getTime())
          } else {
            super(...args)
          }
        }
        static now = () => mockDate.getTime()
      } as any

      const presets = buildDatePresets()

      expect(presets[0]).toEqual({ id: 'today', label: 'Today', start: '2025-01-04', end: '2025-01-04' })
      // Saturday = today, Sunday = tomorrow
      expect(presets[1]).toEqual({ id: 'thursday', label: 'Thursday', start: '2025-01-09', end: '2025-01-09' })
      expect(presets[2]).toEqual({ id: 'friday', label: 'Friday', start: '2025-01-10', end: '2025-01-10' })
      expect(presets[3]).toEqual({ id: 'saturday', label: 'Saturday', start: '2025-01-04', end: '2025-01-04' }) // Today
      expect(presets[4]).toEqual({ id: 'sunday', label: 'Sunday', start: '2025-01-05', end: '2025-01-05' }) // Tomorrow
      expect(presets[5]).toEqual({ id: 'this_weekend', label: 'This weekend', start: '2025-01-04', end: '2025-01-05' })
    })

    it('should return correct dates when today is Thursday', () => {
      // Mock Thursday, 2025-01-02 (day 4)
      const mockDate = new originalDate('2025-01-02T12:00:00Z') // Thursday
      global.Date = class extends originalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(mockDate.getTime())
          } else {
            super(...args)
          }
        }
        static now = () => mockDate.getTime()
      } as any

      const presets = buildDatePresets()

      // Thursday should be today
      expect(presets[1]).toEqual({ id: 'thursday', label: 'Thursday', start: '2025-01-02', end: '2025-01-02' })
    })
  })

  describe('getDatePresetById', () => {
    it('should return correct preset for thursday when today is Wednesday', () => {
      const mockDate = new originalDate('2025-01-01T12:00:00Z') // Wednesday
      global.Date = class extends originalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(mockDate.getTime())
          } else {
            super(...args)
          }
        }
        static now = () => mockDate.getTime()
      } as any

      const preset = getDatePresetById('thursday')
      expect(preset).toEqual({ id: 'thursday', label: 'Thursday', start: '2025-01-02', end: '2025-01-02' })
    })

    it('should return null for unknown preset', () => {
      const preset = getDatePresetById('unknown')
      expect(preset).toBeNull()
    })
  })

  describe('isKnownPreset', () => {
    it('should return true for known presets', () => {
      expect(isKnownPreset('today')).toBe(true)
      expect(isKnownPreset('thursday')).toBe(true)
      expect(isKnownPreset('friday')).toBe(true)
      expect(isKnownPreset('saturday')).toBe(true)
      expect(isKnownPreset('sunday')).toBe(true)
      expect(isKnownPreset('this_weekend')).toBe(true)
    })

    it('should return false for unknown presets', () => {
      expect(isKnownPreset('unknown')).toBe(false)
      expect(isKnownPreset('weekend')).toBe(false) // Legacy, not in known list
      expect(isKnownPreset('next_weekend')).toBe(false) // Legacy, not in known list
    })
  })
})

