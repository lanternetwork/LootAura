/**
 * Date window computation utilities for sales filtering
 * All dates are computed in UTC for consistency
 * TODO: Consider per-timezone windows for better user experience
 */

export interface DateWindow {
  start: Date
  end: Date
  label: string
}

/**
 * Get today's date window (00:00 UTC to 23:59 UTC)
 */
export function getTodayWindow(): DateWindow {
  const now = new Date()
  const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  
  const start = new Date(today.getTime())
  const end = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
  
  return {
    start,
    end,
    label: 'Today'
  }
}

/**
 * Get this weekend's date window (upcoming Saturday 00:00 UTC to Sunday 23:59 UTC)
 */
export function getWeekendWindow(): DateWindow {
  const now = new Date()
  const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dayOfWeek = today.getUTCDay()
  
  // Calculate days until Saturday (6) and Sunday (7)
  const daysUntilSaturday = (6 - dayOfWeek) % 7
  const daysUntilSunday = (7 - dayOfWeek) % 7
  
  const saturday = new Date(today)
  saturday.setUTCDate(today.getUTCDate() + daysUntilSaturday)
  
  const sunday = new Date(today)
  sunday.setUTCDate(today.getUTCDate() + daysUntilSunday)
  
  const start = new Date(saturday.getTime())
  const end = new Date(sunday.getTime() + 24 * 60 * 60 * 1000 - 1000)
  
  return {
    start,
    end,
    label: 'This Weekend'
  }
}

/**
 * Get next weekend's date window (the weekend after the upcoming one)
 */
export function getNextWeekendWindow(): DateWindow {
  const now = new Date()
  const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dayOfWeek = today.getUTCDay()
  
  // Calculate days until next weekend (7 days after this weekend)
  const daysUntilNextSaturday = (6 - dayOfWeek) % 7 + 7
  const daysUntilNextSunday = (7 - dayOfWeek) % 7 + 7
  
  const nextSaturday = new Date(today)
  nextSaturday.setUTCDate(today.getUTCDate() + daysUntilNextSaturday)
  
  const nextSunday = new Date(today)
  nextSunday.setUTCDate(today.getUTCDate() + daysUntilNextSunday)
  
  const start = new Date(nextSaturday.getTime())
  const end = new Date(nextSunday.getTime() + 24 * 60 * 60 * 1000 - 1000)
  
  return {
    start,
    end,
    label: 'Next Weekend'
  }
}

/**
 * Get custom date range window
 */
export function getRangeWindow(startDate: string, endDate: string): DateWindow {
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  // Ensure end date includes the full day
  end.setUTCHours(23, 59, 59, 999)
  
  return {
    start,
    end,
    label: `Custom Range (${startDate} to ${endDate})`
  }
}

/**
 * Get date window based on dateRange parameter
 */
export function getDateWindow(dateRange: string, startDate?: string, endDate?: string): DateWindow | null {
  switch (dateRange) {
    case 'today':
      return getTodayWindow()
    case 'weekend':
      return getWeekendWindow()
    case 'next_weekend':
      return getNextWeekendWindow()
    case 'range':
      if (!startDate || !endDate) return null
      return getRangeWindow(startDate, endDate)
    default:
      return null
  }
}

/**
 * Check if a sale overlaps with a date window
 */
export function saleOverlapsWindow(
  saleStart: string, 
  saleEnd: string | null, 
  window: DateWindow
): boolean {
  const start = new Date(saleStart)
  const end = saleEnd ? new Date(saleEnd) : new Date(start.getTime() + 4 * 60 * 60 * 1000) // Default 4h duration
  
  return start <= window.end && end >= window.start
}

/**
 * Format date window for display
 */
export function formatDateWindow(window: DateWindow): string {
  const startStr = window.start.toISOString().split('T')[0]
  const endStr = window.end.toISOString().split('T')[0]
  
  if (startStr === endStr) {
    return `${window.label} • ${startStr}`
  } else {
    return `${window.label} • ${startStr} to ${endStr}`
  }
}
