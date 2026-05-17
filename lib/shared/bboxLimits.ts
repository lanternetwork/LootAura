/**
 * Shared bbox span limit for /api/sales and client fetch preparation.
 * ~10 degrees ≈ 1110km — prevents continental-scale queries.
 */
export const MAX_BBOX_SPAN_DEGREES = 10
