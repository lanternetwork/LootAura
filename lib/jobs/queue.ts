/**
 * Job queue operations: enqueue and dequeue jobs
 */

import { randomUUID } from 'crypto'
import { BaseJob, JobType } from './types'
import * as redis from './redis'

/**
 * Enqueue a new job
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, any>,
  options: { maxAttempts?: number } = {}
): Promise<string> {
  const jobId = randomUUID()
  const job: BaseJob = {
    id: jobId,
    type,
    payload,
    enqueuedAt: Date.now(),
    attempts: 0,
    maxAttempts: options.maxAttempts || 3,
  }

  try {
    // Store job data
    await redis.setJobData(jobId, job)
    
    // Add to queue
    await redis.pushJobToQueue(jobId)
    
    return jobId
  } catch (error) {
    // If Redis is not configured, log warning but don't fail
    if (error instanceof Error && error.message === 'REDIS_NOT_CONFIGURED') {
      console.warn('[JOBS] Redis not configured, job not enqueued:', { type, jobId })
      // Return job ID anyway for testing/development
      return jobId
    }
    throw error
  }
}

/**
 * Dequeue jobs from the queue (up to limit)
 */
export async function dequeueJobs(limit: number = 10): Promise<BaseJob[]> {
  try {
    const jobIds = await redis.popJobsFromQueue(limit)
    const jobs: BaseJob[] = []

    for (const jobId of jobIds) {
      const jobData = await redis.getJobData(jobId)
      if (jobData) {
        jobs.push(jobData as BaseJob)
      } else {
        // Job data expired or was deleted, skip it
        console.warn('[JOBS] Job data not found for ID:', jobId)
      }
    }

    return jobs
  } catch (error) {
    if (error instanceof Error && error.message === 'REDIS_NOT_CONFIGURED') {
      // Return empty array if Redis not configured
      return []
    }
    throw error
  }
}

/**
 * Mark a job as completed (delete its data)
 */
export async function completeJob(jobId: string): Promise<void> {
  try {
    await redis.deleteJobData(jobId)
  } catch (error) {
    // Log but don't throw - cleanup is best effort
    console.warn('[JOBS] Failed to complete job:', jobId, error)
  }
}

/**
 * Increment job attempt count and re-enqueue if under max attempts
 */
export async function retryJob(job: BaseJob): Promise<boolean> {
  const attempts = (job.attempts || 0) + 1
  const maxAttempts = job.maxAttempts || 3

  if (attempts >= maxAttempts) {
    // Max attempts reached, don't retry
    await completeJob(job.id)
    return false
  }

  // Update job with new attempt count
  const updatedJob: BaseJob = {
    ...job,
    attempts,
  }

  try {
    await redis.setJobData(job.id, updatedJob)
    await redis.pushJobToQueue(job.id)
    return true
  } catch (error) {
    console.error('[JOBS] Failed to retry job:', job.id, error)
    return false
  }
}

/**
 * Get queue status
 */
export async function getQueueStatus(): Promise<{ length: number; redisConfigured: boolean }> {
  try {
    const length = await redis.getQueueLength()
    return { length, redisConfigured: true }
  } catch (error) {
    return { length: 0, redisConfigured: false }
  }
}

