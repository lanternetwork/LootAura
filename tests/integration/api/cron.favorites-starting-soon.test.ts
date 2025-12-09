/**
 * Integration tests for Favorites Starting Soon cron endpoint
 * 
 * Tests the HTTP endpoint authentication and job triggering logic
 * without actually sending emails or hitting the database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'

// Mock the cron auth helper (kept to avoid import errors)
vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: vi.fn(),
}))

// Mock the job processor
vi.mock('@/lib/jobs/processor', () => ({
  processFavoriteSalesStartingSoonJob: vi.fn(),
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
  generateOperationId: vi.fn(() => 'test-op-id-123'),
}))

describe('GET /api/cron/favorites-starting-soon', () => {
  let handler: (request: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    const module = await import('@/app/api/cron/favorites-starting-soon/route')
    handler = module.GET
  })

  it('returns 410 (deprecated stub)', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorites-starting-soon', {
      method: 'GET',
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(410)
    expect(data.deprecated).toBe(true)
    expect(data.ok).toBe(false)
    expect(processFavoriteSalesStartingSoonJob).not.toHaveBeenCalled()
  })
})

describe('POST /api/cron/favorites-starting-soon', () => {
  let handler: (request: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    const module = await import('@/app/api/cron/favorites-starting-soon/route')
    handler = module.POST
  })

  it('returns 410 (deprecated stub)', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorites-starting-soon', {
      method: 'POST',
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(410)
    expect(data.deprecated).toBe(true)
    expect(data.ok).toBe(false)
    expect(processFavoriteSalesStartingSoonJob).not.toHaveBeenCalled()
  })
})

