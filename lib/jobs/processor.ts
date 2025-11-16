/**
 * Job processor - dispatches jobs to type-specific handlers
 */

import { BaseJob, JOB_TYPES, ImagePostprocessJobPayload, CleanupOrphanedDataJobPayload, AnalyticsAggregateJobPayload } from './types'
import { retryJob, completeJob } from './queue'
import { logger } from '@/lib/log'
import * as Sentry from '@sentry/nextjs'

/**
 * Process a single job
 */
export async function processJob(job: BaseJob): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now()
  
  try {
    logger.info('Processing job', {
      component: 'jobs/processor',
      jobId: job.id,
      jobType: job.type,
      attempts: job.attempts || 0,
    })

    let result: { success: boolean; error?: string }

    switch (job.type) {
      case JOB_TYPES.IMAGE_POSTPROCESS:
        result = await processImagePostprocessJob(job.payload as ImagePostprocessJobPayload)
        break
      
      case JOB_TYPES.CLEANUP_ORPHANED_DATA:
        result = await processCleanupOrphanedDataJob(job.payload as CleanupOrphanedDataJobPayload)
        break
      
      case JOB_TYPES.ANALYTICS_AGGREGATE:
        result = await processAnalyticsAggregateJob(job.payload as AnalyticsAggregateJobPayload)
        break
      
      default:
        result = { success: false, error: `Unknown job type: ${job.type}` }
    }

    const duration = Date.now() - startTime

    if (result.success) {
      logger.info('Job completed successfully', {
        component: 'jobs/processor',
        jobId: job.id,
        jobType: job.type,
        durationMs: duration,
      })
      await completeJob(job.id)
      return result
    } else {
      // Job failed - retry if under max attempts
      const willRetry = await retryJob(job)
      
      logger.warn('Job failed', {
        component: 'jobs/processor',
        jobId: job.id,
        jobType: job.type,
        error: result.error,
        willRetry,
        attempts: job.attempts || 0,
        durationMs: duration,
      })

      // Report to Sentry
      Sentry.captureException(new Error(result.error), {
        tags: {
          jobType: job.type,
          jobId: job.id,
          willRetry: String(willRetry),
        },
        extra: {
          payload: job.payload,
          attempts: job.attempts || 0,
        },
      })

      return result
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    logger.error('Job processing error', error instanceof Error ? error : new Error(errorMessage), {
      component: 'jobs/processor',
      jobId: job.id,
      jobType: job.type,
      durationMs: duration,
    })

    // Try to retry
    const willRetry = await retryJob(job)

    // Report to Sentry
    Sentry.captureException(error instanceof Error ? error : new Error(errorMessage), {
      tags: {
        jobType: job.type,
        jobId: job.id,
        willRetry: String(willRetry),
      },
      extra: {
        payload: job.payload,
        attempts: job.attempts || 0,
      },
    })

    return { success: false, error: errorMessage }
  }
}

/**
 * Process image post-processing job
 */
async function processImagePostprocessJob(payload: ImagePostprocessJobPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { imageUrl, saleId } = payload

    if (!imageUrl) {
      return { success: false, error: 'Missing imageUrl in payload' }
    }

    // Validate that the image URL is accessible
    // This is a non-critical check - if it fails, we log but don't fail the sale
    try {
      const response = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
      
      if (!response.ok) {
        logger.warn('Image validation failed', {
          component: 'jobs/image-postprocess',
          imageUrl,
          saleId,
          status: response.status,
        })
        // Still return success - this is non-critical
      } else {
        logger.info('Image validated successfully', {
          component: 'jobs/image-postprocess',
          imageUrl,
          saleId,
        })
      }
    } catch (fetchError) {
      // Network error or timeout - log but don't fail
      logger.warn('Image validation error (non-critical)', {
        component: 'jobs/image-postprocess',
        imageUrl,
        saleId,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
      })
    }

    // TODO: Add any additional post-processing here (e.g., metadata extraction, thumbnail generation)
    // For now, we just validate the image is accessible

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Process orphaned data cleanup job
 */
async function processCleanupOrphanedDataJob(payload: CleanupOrphanedDataJobPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { getAdminDb, fromBase } = await import('@/lib/supabase/clients')
    const admin = getAdminDb()
    const batchSize = payload.batchSize || 50
    const itemType = payload.itemType || 'items'

    let deletedCount = 0

    if (itemType === 'items') {
      // Find items with sale_id that doesn't exist in sales table
      // Use a subquery to find orphaned items
      const { data: orphanedItems, error: queryError } = await fromBase(admin, 'items')
        .select('id, sale_id')
        .limit(batchSize)

      if (queryError) {
        return { success: false, error: `Query error: ${queryError.message}` }
      }

      if (!orphanedItems || orphanedItems.length === 0) {
        return { success: true } // No orphaned items found
      }

      // Check which items are actually orphaned (sale doesn't exist)
      const orphanedIds: string[] = []
      for (const item of orphanedItems) {
        const { data: sale } = await fromBase(admin, 'sales')
          .select('id')
          .eq('id', item.sale_id)
          .maybeSingle()

        if (!sale) {
          orphanedIds.push(item.id)
        }
      }

      // Delete orphaned items
      if (orphanedIds.length > 0) {
        const { error: deleteError } = await fromBase(admin, 'items')
          .delete()
          .in('id', orphanedIds)

        if (deleteError) {
          return { success: false, error: `Delete error: ${deleteError.message}` }
        }

        deletedCount = orphanedIds.length
      }
    } else if (itemType === 'analytics_events') {
      // Find analytics_events with sale_id that doesn't exist
      const { data: orphanedEvents, error: queryError } = await fromBase(admin, 'analytics_events')
        .select('id, sale_id')
        .limit(batchSize)

      if (queryError) {
        return { success: false, error: `Query error: ${queryError.message}` }
      }

      if (!orphanedEvents || orphanedEvents.length === 0) {
        return { success: true }
      }

      // Check which events are actually orphaned
      const orphanedIds: string[] = []
      for (const event of orphanedEvents) {
        const { data: sale } = await fromBase(admin, 'sales')
          .select('id')
          .eq('id', event.sale_id)
          .maybeSingle()

        if (!sale) {
          orphanedIds.push(event.id)
        }
      }

      // Delete orphaned events
      if (orphanedIds.length > 0) {
        const { error: deleteError } = await fromBase(admin, 'analytics_events')
          .delete()
          .in('id', orphanedIds)

        if (deleteError) {
          return { success: false, error: `Delete error: ${deleteError.message}` }
        }

        deletedCount = orphanedIds.length
      }
    }

    logger.info('Orphaned data cleanup completed', {
      component: 'jobs/cleanup-orphaned',
      itemType,
      deletedCount,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Process analytics aggregation job
 */
async function processAnalyticsAggregateJob(payload: AnalyticsAggregateJobPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { getAdminDb, fromBase } = await import('@/lib/supabase/clients')
    const admin = getAdminDb()

    // Default to yesterday's date
    const targetDate = payload.date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const saleId = payload.saleId

    // Get events for the target date
    const startOfDay = new Date(targetDate + 'T00:00:00Z')
    const endOfDay = new Date(targetDate + 'T23:59:59.999Z')

    let query = fromBase(admin, 'analytics_events')
      .select('sale_id, event_type, owner_id')
      .gte('ts', startOfDay.toISOString())
      .lte('ts', endOfDay.toISOString())
      .eq('is_test', false)

    if (saleId) {
      query = query.eq('sale_id', saleId)
    }

    const { data: events, error: queryError } = await query

    if (queryError) {
      return { success: false, error: `Query error: ${queryError.message}` }
    }

    if (!events || events.length === 0) {
      logger.info('No events to aggregate', {
        component: 'jobs/analytics-aggregate',
        date: targetDate,
        saleId,
      })
      return { success: true }
    }

    // Aggregate by sale_id and event_type
    const aggregates = new Map<string, { saleId: string; ownerId: string; eventType: string; count: number }>()

    for (const event of events) {
      const key = `${event.sale_id}:${event.event_type}`
      const existing = aggregates.get(key)
      
      if (existing) {
        existing.count++
      } else {
        aggregates.set(key, {
          saleId: event.sale_id,
          ownerId: event.owner_id,
          eventType: event.event_type,
          count: 1,
        })
      }
    }

    // TODO: Store aggregates in a summary table if one exists
    // For now, we just log the aggregates
    logger.info('Analytics aggregation completed', {
      component: 'jobs/analytics-aggregate',
      date: targetDate,
      saleId,
      aggregateCount: aggregates.size,
      totalEvents: events.length,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

