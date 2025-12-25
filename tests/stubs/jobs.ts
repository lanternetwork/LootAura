/**
 * Empty stub for lib/jobs modules
 * Prevents job queue/processor/redis from creating background workers
 */

// Stub types
export enum JOB_TYPES {
  IMAGE_POSTPROCESS = 'image_postprocess',
  CLEANUP_ORPHANED_DATA = 'cleanup_orphaned_data',
  ANALYTICS_AGGREGATE = 'analytics_aggregate',
  FAVORITE_SALES_STARTING_SOON = 'favorite_sales_starting_soon',
  SELLER_WEEKLY_ANALYTICS = 'seller_weekly_analytics',
}

export interface BaseJob {
  id: string
  type: string
  payload: any
  attempts?: number
}

// Stub processor
export async function processJob() {
  return { success: true }
}

export async function processImagePostprocessJob() {
  return { success: true }
}

export async function processCleanupOrphanedDataJob() {
  return { success: true }
}

export async function processAnalyticsAggregateJob() {
  return { success: true }
}

export async function processFavoriteSalesStartingSoonJob() {
  return { success: true }
}

export async function processSellerWeeklyAnalyticsJob() {
  return { success: true }
}

// Stub queue
export async function enqueueJob() {
  return { id: 'stub-id', success: true }
}

export async function dequeueJobs() {
  return []
}

export async function getQueueStatus() {
  return { pending: 0, processing: 0, completed: 0, failed: 0 }
}

export async function retryJob() {
  return { success: true }
}

export async function completeJob() {
  return { success: true }
}

// Stub redis
export async function connectRedis() {
  return { connected: true }
}

export async function disconnectRedis() {
  return { disconnected: true }
}

