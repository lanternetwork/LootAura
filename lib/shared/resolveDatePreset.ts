/**
 * Resolve date preset to concrete from/to dates
 * Single source of truth for date preset conversion
 */

import { getDatePresetById, isKnownPreset } from './datePresets'

export interface ResolvedDateRange {
  from?: string  // YYYY-MM-DD format
  to?: string    // YYYY-MM-DD format
}

/**
 * Date preset type - includes legacy presets for backward compatibility
 */
export type DatePresetType = 
  | 'today' 
  | 'thursday' 
  | 'friday' 
  | 'saturday' 
  | 'sunday' 
  | 'this_weekend'
  | 'weekend' // Legacy alias for 'this_weekend'
  | 'next_weekend' // Legacy, kept for backward compatibility
  | 'any'

/**
 * Resolve a date preset to concrete from/to dates
 * @param preset - The preset type (supports new day presets and legacy presets)
 * @param now - Current date (defaults to new Date())
 * @returns Resolved date range or null for 'any'
 */
export function resolveDatePreset(
  preset: DatePresetType | undefined,
  now: Date = new Date()
): ResolvedDateRange | null {
  if (!preset || preset === 'any') {
    return null
  }

  // Handle legacy 'weekend' as alias for 'this_weekend'
  if (preset === 'weekend') {
    preset = 'this_weekend'
  }

  // Use new preset system if it's a known preset
  if (isKnownPreset(preset)) {
    const datePreset = getDatePresetById(preset, now)
    if (datePreset) {
      return {
        from: datePreset.start,
        to: datePreset.end
      }
    }
  }

  // Legacy 'next_weekend' support (kept for backward compatibility)
  if (preset === 'next_weekend') {
    const toISO = (d: Date) => d.toISOString().slice(0, 10)
    const dayOfWeek = now.getDay()
    // Find the next weekend (Saturday-Sunday) after the current week
    // If we're already in the weekend, go to next week's weekend
    let daysToNextSaturday
    if (dayOfWeek === 0) { // Sunday
      daysToNextSaturday = 6 // Next Saturday
    } else if (dayOfWeek === 6) { // Saturday
      daysToNextSaturday = 7 // Next Saturday
    } else { // Monday-Friday
      daysToNextSaturday = 6 - dayOfWeek + 7 // Next Saturday
    }
    
    const saturday = new Date(now)
    saturday.setDate(now.getDate() + daysToNextSaturday)
    
    const sunday = new Date(now)
    sunday.setDate(now.getDate() + daysToNextSaturday + 1)
    
    return {
      from: toISO(saturday),
      to: toISO(sunday)
    }
  }

  return null
}

/**
 * Check if two resolved date ranges are equal
 * @param a - First date range
 * @param b - Second date range
 * @returns true if both are null or have same from/to values
 */
export function dateRangesEqual(a: ResolvedDateRange | null, b: ResolvedDateRange | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.from === b.from && a.to === b.to
}
