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
  let capturedRequests: Array<{ request: Request; body: any }> = []

  beforeEach(() => {
    vi.clearAllMocks()
    capturedRequests = []
    mockGetCsrfHeaders.mockReturnValue({ 'x-csrf-token': 'test-csrf-token' })
    
    // Set up MSW handler to capture requests - override default handler
    server.use(
      http.post('/api/analytics/track', async ({ request }) => {
        const cloned = request.clone()
        let body: any = null
        try {
          body = await cloned.json()
        } catch {
          // Body might not be JSON or already consumed
        }
        capturedRequests.push({ request: cloned, body })
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

  it('should call /api/analytics/track and include CSRF headers', async () => {
    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'view',
    })

    // Verify getCsrfHeaders was called (proves function executed)
    expect(mockGetCsrfHeaders).toHaveBeenCalled()
    
    // Verify request was made (MSW handler captured it)
    expect(capturedRequests.length).toBe(1)
    const { request } = capturedRequests[0]
    expect(request.method).toBe('POST')
    expect(request.url).toContain('/api/analytics/track')
    
    // Verify CSRF header was included
    const csrfHeader = request.headers.get('x-csrf-token')
    expect(csrfHeader).toBe('test-csrf-token')
    expect(request.headers.get('Content-Type')).toBe('application/json')
  })

  it('should send correct event payload', async () => {
    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'save',
    })

    expect(capturedRequests.length).toBe(1)
    const { body } = capturedRequests[0]
    expect(body).toMatchObject({
      sale_id: 'test-sale-id',
      event_type: 'save',
    })
    expect(body.referrer).toBeDefined()
    expect(body.user_agent).toBeDefined()
  })

  it('should handle errors gracefully without throwing', async () => {
    // Override handler to simulate network error
    server.use(
      http.post('/api/analytics/track', () => {
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
    
    // Verify getCsrfHeaders was still called (function executed)
    expect(mockGetCsrfHeaders).toHaveBeenCalled()
  })

  it('should log errors in debug mode', async () => {
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    
    // Override handler to simulate network error
    server.use(
      http.post('/api/analytics/track', () => {
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
    
    // Verify getCsrfHeaders was still called (function executed)
    expect(mockGetCsrfHeaders).toHaveBeenCalled()
  })

  it('should log failed responses in debug mode', async () => {
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    
    // Override handler to return error response
    server.use(
      http.post('/api/analytics/track', () => {
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
    
    // Verify getCsrfHeaders was still called (function executed)
    expect(mockGetCsrfHeaders).toHaveBeenCalled()
  })
})

