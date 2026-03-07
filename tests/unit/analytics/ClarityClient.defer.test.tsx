/**
 * Unit tests for Clarity deferral on in-app /sales.
 * (a) On in-app /sales, Clarity is not injected immediately but after map_idle.
 * (b) On other routes or non-in-app, Clarity injects immediately.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MAP_IDLE_EVENT } from '@/components/analytics/ClarityClient'

const mockUsePathname = vi.fn(() => '/')
const mockIsNativeApp = vi.fn(() => false)

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

vi.mock('@/lib/runtime/isNativeApp', () => ({
  isNativeApp: () => mockIsNativeApp(),
}))

describe('ClarityClient deferral', () => {
  const originalEnv = process.env.NODE_ENV
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_CLARITY_ID = 'test-clarity-id'
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    // Ensure no existing script
    document.querySelectorAll('script[src*="clarity.ms"]').forEach((s) => s.remove())
    ;(window as any).clarity = undefined
  })

  afterEach(() => {
    addEventListenerSpy?.restore()
    removeEventListenerSpy?.restore()
    delete process.env.NEXT_PUBLIC_CLARITY_ID
    process.env.NODE_ENV = originalEnv
  })

  it('(a) on in-app /sales, does not inject immediately and waits for map_idle', async () => {
    mockUsePathname.mockReturnValue('/sales')
    mockIsNativeApp.mockReturnValue(true)

    const ClarityClient = (await import('@/components/analytics/ClarityClient')).default
    render(<ClarityClient />)

    // Should have registered for map_idle, not injected yet
    expect(addEventListenerSpy).toHaveBeenCalledWith(MAP_IDLE_EVENT, expect.any(Function))
    expect(document.querySelector('script[src*="clarity.ms"]')).toBeNull()

    // Simulate map_idle
    window.dispatchEvent(new CustomEvent(MAP_IDLE_EVENT))

    await waitFor(() => {
      expect(document.querySelector('script[src*="clarity.ms"]')).not.toBeNull()
    })
  })

  it('(b) on non-in-app, injects immediately', async () => {
    mockUsePathname.mockReturnValue('/sales')
    mockIsNativeApp.mockReturnValue(false)

    const ClarityClient = (await import('@/components/analytics/ClarityClient')).default
    render(<ClarityClient />)

    await waitFor(() => {
      expect(document.querySelector('script[src*="clarity.ms"]')).not.toBeNull()
    })
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(MAP_IDLE_EVENT, expect.any(Function))
  })

  it('(b) on other route (e.g. /), injects immediately even when in-app', async () => {
    mockUsePathname.mockReturnValue('/')
    mockIsNativeApp.mockReturnValue(true)

    const ClarityClient = (await import('@/components/analytics/ClarityClient')).default
    render(<ClarityClient />)

    await waitFor(() => {
      expect(document.querySelector('script[src*="clarity.ms"]')).not.toBeNull()
    })
  })
})
