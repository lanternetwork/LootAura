/**
 * Shared date bounds helper for consistent date filtering across API routes
 * Converts YYYY-MM-DD dates to inclusive UTC bounds for database queries
 */

export interface DateBounds {
  start: Date
  end: Date
}

/**
 * Convert a date string (YYYY-MM-DD) to UTC start of day
 */
export function toUtcStartOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/**
 * Convert a date string (YYYY-MM-DD) to UTC end of day
 */
export function toUtcEndOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`)
}

/**
 * Parse date range parameters and return inclusive UTC bounds
 * @param fromDate - Start date in YYYY-MM-DD format (optional)
 * @param toDate - End date in YYYY-MM-DD format (optional)
 * @returns DateBounds or null if no valid dates provided
 */
export function parseDateBounds(fromDate?: string, toDate?: string): DateBounds | null {
  if (!fromDate && !toDate) {
    return null
  }

  const start = fromDate ? toUtcStartOfDay(fromDate) : new Date(0) // Unix epoch
  const end = toDate ? toUtcEndOfDay(toDate) : new Date('2099-12-31T23:59:59.999Z') // Far future

  return { start, end }
}

/**
 * Check if a sale's date range overlaps with the given bounds
 * @param saleStart - Sale start date (can be null)
 * @param saleEnd - Sale end date (can be null, defaults to saleStart for single-day sales)
 * @param bounds - Date bounds to check against
 * @returns true if the sale overlaps with the bounds
 */
export function checkDateOverlap(
  saleStart: Date | null,
  saleEnd: Date | null,
  bounds: DateBounds
): boolean {
  if (!saleStart && !saleEnd) {
    return false // No date info, exclude
  }

  // Use saleStart as both start and end if saleEnd is null (single-day sale)
  const effectiveSaleStart = saleStart || saleEnd!
  const effectiveSaleEnd = saleEnd || saleStart!

  // Check for overlap: sale range [start, end] overlaps bounds [start, end]
  // Overlap exists if: saleStart <= boundsEnd AND saleEnd >= boundsStart
  const overlaps = effectiveSaleStart <= bounds.end && effectiveSaleEnd >= bounds.start
  
  // Debug logging for overlap calculation
  if (process.env.NODE_ENV === 'development') {
    console.log('[DATE OVERLAP]', {
      saleStart: effectiveSaleStart,
      saleEnd: effectiveSaleEnd,
      boundsStart: bounds.start,
      boundsEnd: bounds.end,
      overlaps,
      condition1: effectiveSaleStart <= bounds.end,
      condition2: effectiveSaleEnd >= bounds.start
    })
  }
  
  return overlaps
}

/**
 * Validate date range parameters
 * @param fromDate - Start date string
 * @param toDate - End date string
 * @returns Validation result with error message if invalid
 */
export function validateDateRange(fromDate?: string, toDate?: string): { valid: boolean; error?: string } {
  if (!fromDate && !toDate) {
    return { valid: true }
  }

  if (fromDate && toDate) {
    const from = new Date(fromDate)
    const to = new Date(toDate)
    
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return { valid: false, error: 'Invalid date format' }
    }
    
    if (from > to) {
      return { valid: false, error: 'Start date must be before end date' }
    }
  }

  return { valid: true }
}
