import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enqueueJob, dequeueJobs, getQueueStatus } from '@/lib/jobs/queue'
import * as redis from '@/lib/jobs/redis'

// Mock Redis module
vi.mock('@/lib/jobs/redis', () => ({
  pushJobToQueue: vi.fn(),
  popJobsFromQueue: vi.fn(),
  setJobData: vi.fn(),
  getJobData: vi.fn(),
  deleteJobData: vi.fn(),
  getQueueLength: vi.fn(),
}))

// Mock env
vi.mock('@/lib/env', () => ({
  ENV_SERVER: {
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
  },
}))

describe('Job Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('enqueueJob', () => {
    it('should enqueue a job successfully', async () => {
      const mockPush = vi.mocked(redis.pushJobToQueue)
      const mockSet = vi.mocked(redis.setJobData)
      
      mockPush.mockResolvedValue(undefined)
      mockSet.mockResolvedValue(undefined)

      const jobId = await enqueueJob('image:postprocess', {
        imageUrl: 'https://example.com/image.jpg',
      })

      expect(jobId).toBeTruthy()
      expect(typeof jobId).toBe('string')
      // Verify setJobData was called with correct job data
      expect(mockSet).toHaveBeenCalled()
      const setCall = vi.mocked(mockSet).mock.calls[0]
      expect(setCall[0]).toBe(jobId)
      expect(setCall[1]).toMatchObject({
        type: 'image:postprocess',
        payload: { imageUrl: 'https://example.com/image.jpg' },
        attempts: 0,
        maxAttempts: 3,
      })
      // TTL is a default parameter, so it's not explicitly passed
      // Only 2 arguments are passed: jobId and job data
      expect(setCall.length).toBe(2)
      expect(mockPush).toHaveBeenCalledWith(jobId)
    })

    it('should handle Redis not configured gracefully', async () => {
      const mockPush = vi.mocked(redis.pushJobToQueue)
      const mockSet = vi.mocked(redis.setJobData)
      
      mockSet.mockRejectedValue(new Error('REDIS_NOT_CONFIGURED'))
      mockPush.mockRejectedValue(new Error('REDIS_NOT_CONFIGURED'))

      // Mock console.warn to avoid test output noise
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Should not throw, but return a job ID
      const jobId = await enqueueJob('image:postprocess', {
        imageUrl: 'https://example.com/image.jpg',
      })

      expect(jobId).toBeTruthy()
      expect(consoleWarnSpy).toHaveBeenCalled()
      
      consoleWarnSpy.mockRestore()
    })
  })

  describe('dequeueJobs', () => {
    it('should dequeue jobs successfully', async () => {
      const mockJobIds = ['job1', 'job2']
      const mockJob1 = {
        id: 'job1',
        type: 'image:postprocess',
        payload: { imageUrl: 'https://example.com/image.jpg' },
        enqueuedAt: Date.now(),
      }
      const mockJob2 = {
        id: 'job2',
        type: 'cleanup:orphaned-data',
        payload: { batchSize: 50 },
        enqueuedAt: Date.now(),
      }

      vi.mocked(redis.popJobsFromQueue).mockResolvedValue(mockJobIds)
      vi.mocked(redis.getJobData).mockImplementation(async (id: string) => {
        if (id === 'job1') return mockJob1
        if (id === 'job2') return mockJob2
        return null
      })

      const jobs = await dequeueJobs(10)

      expect(jobs).toHaveLength(2)
      expect(jobs[0].id).toBe('job1')
      expect(jobs[1].id).toBe('job2')
    })

    it('should return empty array when no jobs in queue', async () => {
      vi.mocked(redis.popJobsFromQueue).mockResolvedValue([])

      const jobs = await dequeueJobs(10)

      expect(jobs).toHaveLength(0)
    })

    it('should handle Redis not configured', async () => {
      vi.mocked(redis.popJobsFromQueue).mockRejectedValue(new Error('REDIS_NOT_CONFIGURED'))

      const jobs = await dequeueJobs(10)

      expect(jobs).toHaveLength(0)
    })
  })

  describe('getQueueStatus', () => {
    it('should return queue status when Redis is configured', async () => {
      vi.mocked(redis.getQueueLength).mockResolvedValue(5)

      const status = await getQueueStatus()

      expect(status.length).toBe(5)
      expect(status.redisConfigured).toBe(true)
    })

    it('should return zero length when Redis is not configured', async () => {
      vi.mocked(redis.getQueueLength).mockRejectedValue(new Error('REDIS_NOT_CONFIGURED'))

      const status = await getQueueStatus()

      expect(status.length).toBe(0)
      expect(status.redisConfigured).toBe(false)
    })
  })
})

