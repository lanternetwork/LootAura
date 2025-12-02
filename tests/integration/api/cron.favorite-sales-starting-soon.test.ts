/**
 * Integration tests for Favorite Sales Starting Soon cron endpoint
 * 
 * Tests the HTTP endpoint authentication and job triggering logic
 * without actually sending emails or hitting the database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'

// Mock the cron auth helper
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
}))

describe('GET /api/cron/favorite-sales-starting-soon', () => {
  let handler: (request: NextRequest) => Promise<Response>
  let assertCronAuthorized: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Import the handler dynamically after mocks are set up
    const module = await import('@/app/api/cron/favorite-sales-starting-soon/route')
    handler = module.GET
    
    const cronAuth = await import('@/lib/auth/cron')
    assertCronAuthorized = vi.mocked(cronAuth.assertCronAuthorized)
    
    // Set default env vars for tests
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
  })

  it('should return 401 when Authorization header is missing', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorite-sales-starting-soon', {
      method: 'GET',
    })

    // Mock auth failure (throws NextResponse)
    const { NextResponse } = await import('next/server')
    assertCronAuthorized.mockImplementation(() => {
      throw NextResponse.json(
        { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.ok).toBe(false)
    expect(data.error).toBe('Unauthorized')
    expect(processFavoriteSalesStartingSoonJob).not.toHaveBeenCalled()
  })

  it('should accept GET requests and trigger job when authorized', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorite-sales-starting-soon', {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
      },
    })

    assertCronAuthorized.mockImplementation(() => {})
    vi.mocked(processFavoriteSalesStartingSoonJob).mockResolvedValue({
      success: true,
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.job).toBe('favorite-sales-starting-soon')
    expect(processFavoriteSalesStartingSoonJob).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/cron/favorite-sales-starting-soon', () => {
  let handler: (request: NextRequest) => Promise<Response>
  let assertCronAuthorized: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    
    const module = await import('@/app/api/cron/favorite-sales-starting-soon/route')
    handler = module.POST
    
    const cronAuth = await import('@/lib/auth/cron')
    assertCronAuthorized = vi.mocked(cronAuth.assertCronAuthorized)
    
    // Set default env vars for tests
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
  })

  it('should return 401 when Authorization header is missing', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorite-sales-starting-soon', {
      method: 'POST',
    })

    // Mock auth failure (throws NextResponse)
    const { NextResponse } = await import('next/server')
    assertCronAuthorized.mockImplementation(() => {
      throw NextResponse.json(
        { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.ok).toBe(false)
    expect(data.error).toBe('Unauthorized')
    expect(processFavoriteSalesStartingSoonJob).not.toHaveBeenCalled()
  })

  it('should return 401 when Authorization Bearer token is invalid', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorite-sales-starting-soon', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    })

    // Mock auth failure
    const { NextResponse } = await import('next/server')
    assertCronAuthorized.mockImplementation(() => {
      throw NextResponse.json(
        { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.ok).toBe(false)
    expect(processFavoriteSalesStartingSoonJob).not.toHaveBeenCalled()
  })

  it('should accept GET requests and trigger job when authorized', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorite-sales-starting-soon', {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
      },
    })

    assertCronAuthorized.mockImplementation(() => {})
    vi.mocked(processFavoriteSalesStartingSoonJob).mockResolvedValue({
      success: true,
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.job).toBe('favorite-sales-starting-soon')
    expect(data.runAt).toBeDefined()
    expect(data.env).toBeDefined()
    expect(data.emailsEnabled).toBe(true)
    expect(processFavoriteSalesStartingSoonJob).toHaveBeenCalledTimes(1)
    expect(processFavoriteSalesStartingSoonJob).toHaveBeenCalledWith({})
  })

  it('should accept POST requests and trigger job when authorized', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorite-sales-starting-soon', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
    })

    assertCronAuthorized.mockImplementation(() => {})
    vi.mocked(processFavoriteSalesStartingSoonJob).mockResolvedValue({
      success: true,
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.job).toBe('favorite-sales-starting-soon')
    expect(data.runAt).toBeDefined()
    expect(data.env).toBeDefined()
    expect(data.emailsEnabled).toBe(true)
    expect(processFavoriteSalesStartingSoonJob).toHaveBeenCalledTimes(1)
    expect(processFavoriteSalesStartingSoonJob).toHaveBeenCalledWith({})
  })

  it('should return success with emails disabled message when LOTAURA_ENABLE_EMAILS is false', async () => {
    process.env.LOOTAURA_ENABLE_EMAILS = 'false'
    
    const request = new NextRequest('http://localhost/api/cron/favorite-sales-starting-soon', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
    })

    assertCronAuthorized.mockImplementation(() => {})

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.emailsEnabled).toBe(false)
    expect(data.message).toBe('Emails disabled by configuration')
    // Legacy route now delegates to canonical /favorites-starting-soon endpoint,
    // which returns stats.emailsSent instead of a top-level emailsSent field.
    expect(data.stats?.emailsSent).toBe(0)
    expect(processFavoriteSalesStartingSoonJob).not.toHaveBeenCalled()
    
    // Reset for other tests
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
  })

  it('should return 500 when job execution fails', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorite-sales-starting-soon', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
    })

    assertCronAuthorized.mockImplementation(() => {})
    vi.mocked(processFavoriteSalesStartingSoonJob).mockResolvedValue({
      success: false,
      error: 'Job execution failed',
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.ok).toBe(false)
    expect(data.job).toBe('favorite-sales-starting-soon')
    expect(data.error).toBe('Job execution failed')
    expect(processFavoriteSalesStartingSoonJob).toHaveBeenCalledTimes(1)
  })

  it('should handle unexpected errors gracefully', async () => {
    const request = new NextRequest('http://localhost/api/cron/favorite-sales-starting-soon', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
    })

    assertCronAuthorized.mockImplementation(() => {})
    vi.mocked(processFavoriteSalesStartingSoonJob).mockRejectedValue(
      new Error('Unexpected error')
    )

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.ok).toBe(false)
    expect(data.job).toBe('favorite-sales-starting-soon')
    expect(data.error).toBe('Internal server error')
  })
})

