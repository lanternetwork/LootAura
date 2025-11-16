/**
 * Job types and interfaces for background job processing
 */

export const JOB_TYPES = {
  IMAGE_POSTPROCESS: 'image:postprocess',
  CLEANUP_ORPHANED_DATA: 'cleanup:orphaned-data',
  ANALYTICS_AGGREGATE: 'analytics:aggregate',
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

