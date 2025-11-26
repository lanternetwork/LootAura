/**
 * Unit tests for analytics client helper
 * Tests that trackAnalyticsEvent includes CSRF headers and credentials
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { trackAnalyticsEvent } from '@/lib/analytics-client'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock getCsrfHeaders
const mockGetCsrfHeaders = vi.fn()
vi.mock('@/lib/csrf-client', () => ({
  getCsrfHeaders: () => mockGetCsrfHeaders(),
}))

describe('trackAnalyticsEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { event_id: 'test-event-id' } }),
    })
    mockGetCsrfHeaders.mockReturnValue({ 'x-csrf-token': 'test-csrf-token' })
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
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    
    mockFetch.mockRejectedValue(new Error('Network error'))

    await trackAnalyticsEvent({
      sale_id: 'test-sale-id',
      event_type: 'click',
    })

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[ANALYTICS_CLIENT] Tracking error:',
      expect.objectContaining({
        error: expect.stringContaining('Network error'),
        event: {
          sale_id: 'test-sale-id',
          event_type: 'click',
        },
      })
    )

    consoleWarnSpy.mockRestore()
    delete process.env.NEXT_PUBLIC_DEBUG
  })
})

