/**
 * POST /api/admin/jobs/enqueue
 * Enqueue a job manually (admin-only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { enqueueJob, JOB_TYPES, JobType } from '@/lib/jobs'
import { logger } from '@/lib/log'

export async function POST(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)

    const body = await request.json()
    const { type, payload, maxAttempts } = body

    if (!type || !Object.values(JOB_TYPES).includes(type)) {
      return NextResponse.json(
        { error: 'Invalid job type', validTypes: Object.values(JOB_TYPES) },
        { status: 400 }
      )
    }

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { error: 'Invalid payload, must be an object' },
        { status: 400 }
      )
    }

    const jobId = await enqueueJob(type as JobType, payload, { maxAttempts })

    logger.info('Job enqueued', {
      component: 'api/admin/jobs/enqueue',
      jobId,
      jobType: type,
    })

    return NextResponse.json({
      success: true,
      jobId,
      type,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    logger.error('Job enqueue error', error instanceof Error ? error : new Error(errorMessage), {
      component: 'api/admin/jobs/enqueue',
    })

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

