/**
 * POST /api/admin/jobs/run
 * Process jobs from the queue
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { dequeueJobs, processJob, getQueueStatus } from '@/lib/jobs'
import { logger } from '@/lib/log'

const MAX_JOBS_PER_RUN = 50
const MAX_RUN_TIME_MS = 25 * 1000 // 25 seconds (leave buffer for Vercel timeout)

export async function POST(request: NextRequest) {
  try {
    // Require admin access
    await assertAdminOrThrow(request)

    const startTime = Date.now()
    const jobs = await dequeueJobs(MAX_JOBS_PER_RUN)

    if (jobs.length === 0) {
      const status = await getQueueStatus()
      return NextResponse.json({
        success: true,
        processed: 0,
        queueLength: status.length,
        redisConfigured: status.redisConfigured,
        message: 'No jobs in queue',
      })
    }

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      byType: {} as Record<string, { succeeded: number; failed: number }>,
    }

    // Process jobs sequentially to avoid overwhelming the system
    for (const job of jobs) {
      // Check if we're approaching the time limit
      if (Date.now() - startTime > MAX_RUN_TIME_MS) {
        logger.warn('Job processing stopped due to time limit', {
          component: 'api/admin/jobs/run',
          processed: results.processed,
          remaining: jobs.length - results.processed,
        })
        break
      }

      const result = await processJob(job)
      results.processed++

      if (result.success) {
        results.succeeded++
      } else {
        results.failed++
      }

      // Track by type
      if (!results.byType[job.type]) {
        results.byType[job.type] = { succeeded: 0, failed: 0 }
      }
      if (result.success) {
        results.byType[job.type].succeeded++
      } else {
        results.byType[job.type].failed++
      }
    }

    const duration = Date.now() - startTime
    const status = await getQueueStatus()

    logger.info('Job processing batch completed', {
      component: 'api/admin/jobs/run',
      processed: results.processed,
      succeeded: results.succeeded,
      failed: results.failed,
      durationMs: duration,
      queueLength: status.length,
    })

    return NextResponse.json({
      success: true,
      ...results,
      queueLength: status.length,
      redisConfigured: status.redisConfigured,
      durationMs: duration,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    logger.error('Job processing error', error instanceof Error ? error : new Error(errorMessage), {
      component: 'api/admin/jobs/run',
    })

    // If it's an auth error, return 403
    if (errorMessage.includes('Unauthorized') || errorMessage.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: errorMessage },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error', message: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/jobs/run
 * Get queue status
 */
export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)

    const status = await getQueueStatus()

    return NextResponse.json({
      success: true,
      queueLength: status.length,
      redisConfigured: status.redisConfigured,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    if (errorMessage.includes('Unauthorized') || errorMessage.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: errorMessage },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error', message: errorMessage },
      { status: 500 }
    )
  }
}

