/**
 * Job types and interfaces for background job processing
 */

export const JOB_TYPES = {
  IMAGE_POSTPROCESS: 'image:postprocess',
  CLEANUP_ORPHANED_DATA: 'cleanup:orphaned-data',
  ANALYTICS_AGGREGATE: 'analytics:aggregate',
  FAVORITE_SALES_STARTING_SOON: 'favorites:starting-soon',
  SELLER_WEEKLY_ANALYTICS: 'seller:weekly-analytics',
} as const

export type JobType = typeof JOB_TYPES[keyof typeof JOB_TYPES]

export interface BaseJob {
  id: string
  type: JobType
  payload: Record<string, any>
  enqueuedAt: number
  attempts?: number
  maxAttempts?: number
}

export interface ImagePostprocessJobPayload {
  imageUrl: string
  saleId?: string
  ownerId?: string
  metadata?: Record<string, any>
}

export interface CleanupOrphanedDataJobPayload {
  batchSize?: number
  itemType?: 'items' | 'analytics_events'
}

export interface AnalyticsAggregateJobPayload {
  date?: string // ISO date string, defaults to yesterday
  saleId?: string // Optional: aggregate for specific sale
}

export interface FavoriteSalesStartingSoonJobPayload {
  // No payload needed - job scans all eligible favorites
}

export interface SellerWeeklyAnalyticsJobPayload {
  // Optional: specific date to compute week for (defaults to last full week)
  // Format: ISO date string (e.g., "2025-01-06")
  date?: string
}

