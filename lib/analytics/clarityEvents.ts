/**
 * Microsoft Clarity event tracking helpers
 * Provides type-safe wrappers for Clarity custom events
 */

// Extend Window interface to include Clarity
declare global {
  interface Window {
    clarity?: (
      action: 'event',
      eventName: string,
      payload?: Record<string, unknown>
    ) => void
  }
}

/**
 * Generic function to track a Clarity custom event
 * @param name - Event name (e.g., 'sale_viewed', 'pin_clicked')
 * @param payload - Optional event payload (should not contain PII)
 */
export function trackClarityEvent(
  name: string,
  payload?: Record<string, unknown>
): void {
  // Only run on client side
  if (typeof window === 'undefined') {
    return
  }

  // Check if Clarity is loaded
  if (!window.clarity || typeof window.clarity !== 'function') {
    // Silently fail - Clarity may not be loaded yet or not configured
    return
  }

  try {
    window.clarity('event', name, payload)
  } catch (error) {
    // Silently fail - don't break the app if Clarity has issues
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[Clarity] Failed to track event:', name, error)
    }
  }
}

/**
 * Track when a sale detail page is viewed
 * @param saleId - Sale ID (non-PII)
 */
export function trackSaleViewed(saleId: string): void {
  trackClarityEvent('sale_viewed', {
    sale_id: saleId,
  })
}

/**
 * Track when a map pin is clicked
 * @param saleId - Sale ID (non-PII)
 */
export function trackPinClicked(saleId: string): void {
  trackClarityEvent('pin_clicked', {
    sale_id: saleId,
  })
}

/**
 * Track when filters are updated/applied
 * @param filterState - Sanitized filter state (no PII)
 */
export function trackFiltersUpdated(filterState: {
  zip?: string
  dateRange?: string
  distanceMiles?: number
  categoriesCount?: number
  hasFavoritesFilter?: boolean
}): void {
  trackClarityEvent('filters_updated', {
    ...filterState,
    // Only include non-empty values
    ...(filterState.zip && { zip: filterState.zip }),
    ...(filterState.dateRange && { date_range: filterState.dateRange }),
    ...(filterState.distanceMiles !== undefined && {
      distance_miles: filterState.distanceMiles,
    }),
    ...(filterState.categoriesCount !== undefined && {
      categories_count: filterState.categoriesCount,
    }),
    ...(filterState.hasFavoritesFilter !== undefined && {
      has_favorites_filter: filterState.hasFavoritesFilter,
    }),
  })
}

/**
 * Track when a sale is favorited/unfavorited
 * @param saleId - Sale ID (non-PII)
 * @param isFavorite - Whether the sale is now favorited
 */
export function trackFavoriteToggled(saleId: string, isFavorite: boolean): void {
  trackClarityEvent('favorite_toggled', {
    sale_id: saleId,
    is_favorite: isFavorite,
  })
}

