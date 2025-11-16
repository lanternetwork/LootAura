/**
 * Redis utilities for job queue using Upstash REST API
 * Reuses the same Redis connection pattern as rate limiting
 */

import { ENV_SERVER } from '@/lib/env'

const JOB_QUEUE_KEY = 'jobs:queue'
const JOB_DATA_PREFIX = 'jobs:data:'
const JOB_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

interface RedisResponse {
  result: any
}

/**
 * Get Redis connection details
 */
async function getRedisConfig() {
  const redisUrl = ENV_SERVER.UPSTASH_REDIS_REST_URL
  const redisToken = ENV_SERVER.UPSTASH_REDIS_REST_TOKEN

  if (!redisUrl || !redisToken) {
    throw new Error('REDIS_NOT_CONFIGURED')
  }

  return { redisUrl, redisToken }
}

/**
 * Execute a Redis command via REST API
 */
async function redisCommand(command: string, args: any[]): Promise<any> {
  const { redisUrl, redisToken } = await getRedisConfig()

  const response = await fetch(`${redisUrl}/${command}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })

  if (!response.ok) {
    throw new Error(`Redis ${command} failed: ${response.status}`)
  }

  const data: RedisResponse = await response.json()
  return data.result
}

/**
 * Push a job ID to the queue
 */
export async function pushJobToQueue(jobId: string): Promise<void> {
  try {
    await redisCommand('lpush', [JOB_QUEUE_KEY, jobId])
  } catch (error) {
    if (error instanceof Error && error.message === 'REDIS_NOT_CONFIGURED') {
      throw error
    }
    throw new Error(`Failed to enqueue job: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Pop job IDs from the queue (returns up to limit jobs)
 */
export async function popJobsFromQueue(limit: number): Promise<string[]> {
  try {
    const jobIds: string[] = []
    
    // Use RPOP to get jobs in FIFO order (oldest first)
    for (let i = 0; i < limit; i++) {
      const jobId = await redisCommand('rpop', [JOB_QUEUE_KEY])
      if (!jobId) {
        break // No more jobs
      }
      jobIds.push(jobId as string)
    }
    
    return jobIds
  } catch (error) {
    if (error instanceof Error && error.message === 'REDIS_NOT_CONFIGURED') {
      throw error
    }
    throw new Error(`Failed to dequeue jobs: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Store job data in Redis
 */
export async function setJobData(jobId: string, data: any, ttlSeconds: number = JOB_TTL_SECONDS): Promise<void> {
  try {
    const key = `${JOB_DATA_PREFIX}${jobId}`
    await redisCommand('set', [key, JSON.stringify(data)])
    await redisCommand('expire', [key, ttlSeconds])
  } catch (error) {
    if (error instanceof Error && error.message === 'REDIS_NOT_CONFIGURED') {
      throw error
    }
    throw new Error(`Failed to store job data: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Get job data from Redis
 */
export async function getJobData(jobId: string): Promise<any | null> {
  try {
    const key = `${JOB_DATA_PREFIX}${jobId}`
    const data = await redisCommand('get', [key])
    
    if (!data) {
      return null
    }
    
    return JSON.parse(data as string)
  } catch (error) {
    if (error instanceof Error && error.message === 'REDIS_NOT_CONFIGURED') {
      throw error
    }
    // Return null if job not found (might have expired)
    return null
  }
}

/**
 * Delete job data from Redis
 */
export async function deleteJobData(jobId: string): Promise<void> {
  try {
    const key = `${JOB_DATA_PREFIX}${jobId}`
    await redisCommand('del', [key])
  } catch (error) {
    // Ignore errors - job might already be deleted
    if (error instanceof Error && error.message !== 'REDIS_NOT_CONFIGURED') {
      // Log but don't throw for cleanup operations
      console.warn('[JOBS] Failed to delete job data:', error.message)
    }
  }
}

/**
 * Get queue length
 */
export async function getQueueLength(): Promise<number> {
  try {
    const length = await redisCommand('llen', [JOB_QUEUE_KEY])
    return length as number
  } catch (error) {
    if (error instanceof Error && error.message === 'REDIS_NOT_CONFIGURED') {
      return 0
    }
    return 0
  }
}

