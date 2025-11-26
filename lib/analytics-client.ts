/**
 * Client-side analytics tracking helper
 * Centralizes all calls to /api/analytics/track with CSRF protection and proper error handling
 */

import { getCsrfHeaders } from '@/lib/csrf-client'

export type AnalyticsEventType = 'view' | 'save' | 'click' | 'share' | 'favorite'

interface TrackEventParams {
  sale_id: string
  event_type: AnalyticsEventType
  referrer?: string
  user_agent?: string
}

/**
 * Track an analytics event
 * 
 * This function:
 * - Includes CSRF headers and credentials for all requests
 * - Handles errors gracefully (non-blocking, but logs in debug mode)
 * - Returns void - callers should not rely on the result for UX decisions
 * 
 * @param params - Event parameters
 */
export async function trackAnalyticsEvent(params: TrackEventParams): Promise<void> {
  const { sale_id, event_type, referrer, user_agent } = params

  try {
    const response = await fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify({
        sale_id,
        event_type,
        referrer: referrer || (typeof window !== 'undefined' ? window.location.href : undefined),
        user_agent: user_agent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      }),
    })

    if (!response.ok) {
      // Log error in debug mode, but don't throw
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.warn('[ANALYTICS_CLIENT] Tracking failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          event: { sale_id, event_type },
        })
      }
    }
  } catch (error) {
    // Log error in debug mode, but don't throw
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[ANALYTICS_CLIENT] Tracking error:', {
        error: error instanceof Error ? error.message : String(error),
        event: { sale_id, event_type },
      })
    }
    // Silently fail - analytics tracking must not break the UI
  }
}

