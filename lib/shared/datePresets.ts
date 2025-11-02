/**
 * Date preset definitions - single source of truth for date filters
 */

export type DatePreset = {
  id: string
  label: string
  start: string // ISO date (YYYY-MM-DD)
  end: string   // ISO date (YYYY-MM-DD)
}

/**
 * Helper to get next occurrence of a weekday
 * @param base - Base date to calculate from
 * @param targetWeekday - Target weekday (0=Sun, 1=Mon, ..., 6=Sat)
 * @returns start/end as YYYY-MM-DD, start == end for single day
 */
function nextWeekday(base: Date, targetWeekday: number): { start: string; end: string } {
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  
  const baseDay = base.getDay()
  // Calculate days until target weekday (0 = today, 1-6 = this week, 7+ = next week)
  let daysToAdd = (targetWeekday - baseDay + 7) % 7
  // If it's 0 and we're not on the target day, we need next week
  // But if baseDay === targetWeekday, daysToAdd is already 0 correctly
  if (daysToAdd === 0 && baseDay !== targetWeekday) {
    daysToAdd = 7 // Next week's occurrence
  }
  
  const targetDate = new Date(base)
  targetDate.setDate(base.getDate() + daysToAdd)
  
  const dateStr = toISO(targetDate)
  return { start: dateStr, end: dateStr }
}

/**
 * Build date presets array for the current date
 * @param now - Current date (defaults to new Date())
 * @returns Array of DatePreset objects in order: today, thursday, friday, saturday, sunday, this_weekend
 */
export function buildDatePresets(now: Date = new Date()): DatePreset[] {
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  
  const presets: DatePreset[] = []
  
  // 1. Today
  const today = new Date(now)
  const todayStr = toISO(today)
  presets.push({
    id: 'today',
    label: 'Today',
    start: todayStr,
    end: todayStr
  })
  
  // 2. Thursday (4)
  const thursday = nextWeekday(now, 4)
  presets.push({
    id: 'thursday',
    label: 'Thursday',
    start: thursday.start,
    end: thursday.end
  })
  
  // 3. Friday (5)
  const friday = nextWeekday(now, 5)
  presets.push({
    id: 'friday',
    label: 'Friday',
    start: friday.start,
    end: friday.end
  })
  
  // 4. Saturday (6)
  const saturday = nextWeekday(now, 6)
  presets.push({
    id: 'saturday',
    label: 'Saturday',
    start: saturday.start,
    end: saturday.end
  })
  
  // 5. Sunday (0)
  const sunday = nextWeekday(now, 0)
  presets.push({
    id: 'sunday',
    label: 'Sunday',
    start: sunday.start,
    end: sunday.end
  })
  
  // 6. This weekend (Saturday-Sunday)
  const dayOfWeek = now.getDay()
  let saturday: Date, sunday: Date
  
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
  
  presets.push({
    id: 'this_weekend',
    label: 'This weekend',
    start: toISO(saturday),
    end: toISO(sunday)
  })
  
  return presets
}

/**
 * Get a date preset by ID
 * @param presetId - Preset ID to look up
 * @param now - Current date (defaults to new Date())
 * @returns DatePreset or null if not found
 */
export function getDatePresetById(presetId: string, now: Date = new Date()): DatePreset | null {
  const presets = buildDatePresets(now)
  return presets.find(p => p.id === presetId) || null
}

/**
 * Check if a string is a known date preset ID
 * @param value - Value to check
 * @returns true if value is a known preset ID
 */
export function isKnownPreset(value: string): boolean {
  const knownPresets = ['today', 'thursday', 'friday', 'saturday', 'sunday', 'this_weekend']
  return knownPresets.includes(value)
}

