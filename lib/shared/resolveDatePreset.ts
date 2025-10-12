/**
 * Resolve date preset to concrete from/to dates
 * Single source of truth for date preset conversion
 */

export interface ResolvedDateRange {
  from?: string  // YYYY-MM-DD format
  to?: string    // YYYY-MM-DD format
}

/**
 * Resolve a date preset to concrete from/to dates
 * @param preset - The preset type ('today', 'weekend', 'next_weekend', 'any')
 * @param now - Current date (defaults to new Date())
 * @returns Resolved date range or null for 'any'
 */
export function resolveDatePreset(
  preset: 'today' | 'weekend' | 'next_weekend' | 'any' | undefined,
  now: Date = new Date()
): ResolvedDateRange | null {
  if (!preset || preset === 'any') {
    return null
  }

  const toISO = (d: Date) => d.toISOString().slice(0, 10)

  switch (preset) {
    case 'today': {
      const today = new Date(now)
      return {
        from: toISO(today),
        to: toISO(today)
      }
    }

    case 'weekend': {
      const dayOfWeek = now.getDay()
      // Find this weekend (Saturday-Sunday)
      let saturday, sunday
      
      if (dayOfWeek === 0) { // Sunday
        // Previous Saturday to today (Sunday)
        saturday = new Date(now)
        saturday.setDate(now.getDate() - 1) // Yesterday (Saturday)
        sunday = new Date(now) // Today (Sunday)
      } else if (dayOfWeek === 6) { // Saturday
        // Today (Saturday) to tomorrow (Sunday)
        saturday = new Date(now) // Today (Saturday)
        sunday = new Date(now)
        sunday.setDate(now.getDate() + 1) // Tomorrow (Sunday)
      } else { // Monday-Friday
        // This coming Saturday and Sunday
        const daysToSaturday = 6 - dayOfWeek
        const daysToSunday = 7 - dayOfWeek
        
        saturday = new Date(now)
        saturday.setDate(now.getDate() + daysToSaturday)
        
        sunday = new Date(now)
        sunday.setDate(now.getDate() + daysToSunday)
      }
      
      return {
        from: toISO(saturday),
        to: toISO(sunday)
      }
    }

    case 'next_weekend': {
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

    default:
      return null
  }
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
