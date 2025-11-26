/**
 * @vitest-environment node
 * Unit tests for analytics client helper
 * Tests that trackAnalyticsEvent includes CSRF headers and credentials
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/tests/setup/msw.server'
import { trackAnalyticsEvent } from '@/lib/analytics-client'

// Mock getCsrfHeaders
const mockGetCsrfHeaders = vi.fn()
vi.mock('@/lib/csrf-client', () => ({
  getCsrfHeaders: () => mockGetCsrfHeaders(),
}))

describe('trackAnalyticsEvent', () => {
  let requestCount = 0
  let lastRequest: Request | null = null
  let lastBody: any = null

  beforeEach(() => {
    vi.clearAllMocks()
    requestCount = 0
    lastRequest = null
    lastBody = null
    mockGetCsrfHeaders.mockReturnValue({ 'x-csrf-token': 'test-csrf-token' })
    
    // Set up MSW handler to capture requests
    server.use(
      http.post('*/api/analytics/track', async ({ request }) => {
        requestCount++
        lastRequest = request.clone()
        try {
          lastBody = await request.json()
        } catch {
          // Body might not be JSON or already consumed
        }
        return HttpResponse.json({ ok: true, data: { event_id: 'test-event-id' } }, { status: 200 })
      })
    )
    
    // Ensure window and navigator are available for the test
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = { location: { href: 'http://localhost:3000/' } }
    }
    if (typeof globalThis.navigator === 'undefined') {
      (globalThis as any).navigator = { userAgent: 'test-user-agent' }
    }
  })

  afterEach(() => {
    // Clean up environment variables
    delete process.env.NEXT_PUBLIC_DEBUG
    server.resetHandlers()
  })

  it('should call /api/analytics/track with POST method', async () => {
    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'view',
    })

    expect(requestCount).toBe(1)
    expect(lastRequest).not.toBeNull()
    expect(lastRequest?.method).toBe('POST')
    expect(lastRequest?.url).toContain('/api/analytics/track')
  })

  it('should include CSRF headers from getCsrfHeaders', async () => {
    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'click',
    })

    expect(mockGetCsrfHeaders).toHaveBeenCalled()
    expect(lastRequest).not.toBeNull()
    const csrfHeader = lastRequest?.headers.get('x-csrf-token')
    expect(csrfHeader).toBe('test-csrf-token')
    expect(lastRequest?.headers.get('Content-Type')).toBe('application/json')
  })

  it('should send correct event payload', async () => {
    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'save',
    })

    expect(lastRequest).not.toBeNull()
    expect(lastBody).not.toBeNull()
    expect(lastBody).toMatchObject({
      sale_id: 'test-sale-id',
      event_type: 'save',
    })
    expect(lastBody.referrer).toBeDefined()
    expect(lastBody.user_agent).toBeDefined()
  })

  it('should handle errors gracefully without throwing', async () => {
    // Override handler to simulate network error
    server.use(
      http.post('*/api/analytics/track', () => {
        throw new Error('Network error')
      })
    )

    // Should not throw
    await expect(
      trackAnalyticsEvent({
        sale_id: 'test-sale-id',
        event_type: 'view',
      })
    ).resolves.toBeUndefined()
  })

  it('should log errors in debug mode', async () => {
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    
    // Override handler to simulate network error
    server.use(
      http.post('*/api/analytics/track', () => {
        throw new Error('Network error')
      })
    )

    // Should not throw - errors are caught and logged
    await expect(
      trackAnalyticsEvent({
        sale_id: 'test-sale-id',
        event_type: 'click',
      })
    ).resolves.toBeUndefined()
  })

  it('should log failed responses in debug mode', async () => {
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    
    // Override handler to return error response
    server.use(
      http.post('*/api/analytics/track', () => {
        return HttpResponse.json({ error: 'Server error' }, { status: 500 })
      })
    )

    // Should not throw - errors are caught and logged
    await expect(
      trackAnalyticsEvent({
        sale_id: 'test-sale-id',
        event_type: 'view',
      })
    ).resolves.toBeUndefined()
  })
})

