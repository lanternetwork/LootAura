/**
 * Row cap for GET /api/sales direct query before post-query distance sort.
 * MUST stay aligned with app/api/sales/route.ts usage.
 */
export const SALES_FETCH_WINDOW_MAX = 1000

export const SALES_FETCH_WINDOW_MIN = 200

export const SALES_FETCH_WINDOW_LIMIT_MULTIPLIER = 5

/**
 * Computes how many rows PostgREST fetches before Haversine filter/sort.
 *
 * @example Marketplace map (limit=200, offset=0) → 1000 rows
 */
export function computeSalesFetchWindow(offset: number, limit: number): number {
  return Math.min(
    SALES_FETCH_WINDOW_MAX,
    Math.max((offset + limit) * SALES_FETCH_WINDOW_LIMIT_MULTIPLIER, SALES_FETCH_WINDOW_MIN)
  )
}

/**
 * True when the query may truncate spatially relevant rows before distance sort.
 * (More matching rows exist in bbox than fetchWindow allows through date_start ordering.)
 */
export function isFetchWindowCapped(offset: number, limit: number): boolean {
  return computeSalesFetchWindow(offset, limit) >= SALES_FETCH_WINDOW_MAX
}
