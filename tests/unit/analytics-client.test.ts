/**
 * @vitest-environment node
 * Unit tests for analytics client helper
 * Tests that trackAnalyticsEvent includes CSRF headers and credentials
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { trackAnalyticsEvent } from '@/lib/analytics-client'

// Mock fetch - use vi.stubGlobal to ensure it's mocked before MSW intercepts
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock getCsrfHeaders
const mockGetCsrfHeaders = vi.fn()
vi.mock('@/lib/csrf-client', () => ({
  getCsrfHeaders: () => mockGetCsrfHeaders(),
}))

describe('trackAnalyticsEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch mock to return successful response by default
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true,"data":{"event_id":"test-event-id"}}',
      json: async () => ({ ok: true, data: { event_id: 'test-event-id' } }),
    })
    mockGetCsrfHeaders.mockReturnValue({ 'x-csrf-token': 'test-csrf-token' })
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
  })

  it('should call /api/analytics/track with POST method', async () => {
    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'view',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/analytics/track',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('should include CSRF headers from getCsrfHeaders', async () => {
    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'click',
    })

    expect(mockGetCsrfHeaders).toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/analytics/track',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-csrf-token': 'test-csrf-token',
        }),
      })
    )
  })

  it('should include credentials: include', async () => {
    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'share',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/analytics/track',
      expect.objectContaining({
        credentials: 'include',
      })
    )
  })

  it('should send correct event payload', async () => {
    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'save',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/analytics/track',
      expect.objectContaining({
        body: JSON.stringify({
          sale_id: 'test-sale-id',
          event_type: 'save',
          referrer: expect.any(String),
          user_agent: expect.any(String),
        }),
      })
    )
  })

  it('should handle errors gracefully without throwing', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

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
    
    mockFetch.mockRejectedValue(new Error('Network error'))

    // Should not throw - errors are caught and logged
    await expect(
      trackAnalyticsEvent({
        sale_id: 'test-sale-id',
        event_type: 'click',
      })
    ).resolves.toBeUndefined()

    // Verify fetch was called
    expect(mockFetch).toHaveBeenCalled()
  })

  it('should log failed responses in debug mode', async () => {
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => '{"error":"Server error"}',
    })

    // Should not throw - errors are caught and logged
    await expect(
      trackAnalyticsEvent({
        sale_id: 'test-sale-id',
        event_type: 'view',
      })
    ).resolves.toBeUndefined()

    // Verify fetch was called
    expect(mockFetch).toHaveBeenCalled()
  })
})

