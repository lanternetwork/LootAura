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
      const daysUntilSaturday = (6 - dayOfWeek) % 7
      const daysUntilSunday = (7 - dayOfWeek) % 7
      
      const saturday = new Date(now)
      saturday.setDate(now.getDate() + daysUntilSaturday)
      
      const sunday = new Date(now)
      sunday.setDate(now.getDate() + daysUntilSunday)
      
      return {
        from: toISO(saturday),
        to: toISO(sunday)
      }
    }

    case 'next_weekend': {
      const dayOfWeek = now.getDay()
      const daysUntilSaturday = ((6 - dayOfWeek) % 7) + 7
      const daysUntilSunday = ((7 - dayOfWeek) % 7) + 7
      
      const saturday = new Date(now)
      saturday.setDate(now.getDate() + daysUntilSaturday)
      
      const sunday = new Date(now)
      sunday.setDate(now.getDate() + daysUntilSunday)
      
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
