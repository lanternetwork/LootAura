/**
 * Integration tests for share redirect functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import ShortlinkPage from '@/app/s/[id]/page'
import { getAdminDb } from '@/lib/supabase/clients'
import { shouldBypassRateLimit } from '@/lib/rateLimit/config'
import { check } from '@/lib/rateLimit/limiter'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn()
}))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '127.0.0.1' }))
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn()
}))
vi.mock('@/lib/rateLimit/config', () => ({
  shouldBypassRateLimit: vi.fn(() => true)
}))
vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn(async () => ({
    allowed: true,
    softLimited: false,
    remaining: 100,
    resetAt: Math.floor(Date.now() / 1000) + 60,
  }))
}))

// Mock URL state serialization
vi.mock('@/lib/url/state', () => ({
  serializeState: vi.fn((state) => `lat=${state.view.lat}&lng=${state.view.lng}&zoom=${state.view.zoom}`)
}))

describe('Share Redirect Integration', () => {
  const mockAdminDb = {
    from: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAdminDb).mockReturnValue(mockAdminDb as any)
    vi.mocked(shouldBypassRateLimit).mockReturnValue(true)
    vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': '127.0.0.1' }) as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should redirect to explore page with serialized state', async () => {
    const mockState = {
      view: { lat: 40.7128, lng: -74.0060, zoom: 12 },
      filters: { dateRange: 'today', categories: ['furniture'], radius: 50 }
    }

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { state_json: mockState },
          error: null
        })
      })
    })
    mockAdminDb.from.mockReturnValue({ select: mockSelect })

    const { serializeState } = await import('@/lib/url/state')
    vi.mocked(serializeState).mockReturnValue('lat=40.7128&lng=-74.006&zoom=12')

    await ShortlinkPage({ params: Promise.resolve({ id: 'test12345' }) })

    expect(mockAdminDb.from).toHaveBeenCalledWith('shared_states')
    expect(serializeState).toHaveBeenCalledWith(mockState)
    expect(redirect).toHaveBeenCalledWith('/explore?lat=40.7128&lng=-74.006&zoom=12')
  })

  it('should call notFound for invalid short ID', async () => {
    await ShortlinkPage({ params: Promise.resolve({ id: '' }) })

    expect(notFound).toHaveBeenCalled()
  })

  it('should call notFound for missing data', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' }
        })
      })
    })
    mockAdminDb.from.mockReturnValue({ select: mockSelect })

    await ShortlinkPage({ params: Promise.resolve({ id: 'nonexistent' }) })

    expect(notFound).toHaveBeenCalled()
  })

  it('should handle database errors gracefully', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockRejectedValue(new Error('Database error'))
      })
    })
    mockAdminDb.from.mockReturnValue({ select: mockSelect })

    // Mock console.error to avoid noise in tests
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await ShortlinkPage({ params: Promise.resolve({ id: 'test12345' }) })

    expect(consoleSpy).toHaveBeenCalled()
    expect(notFound).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('should not read database when redirect path is rate limited', async () => {
    vi.mocked(shouldBypassRateLimit).mockReturnValue(false)
    vi.mocked(check).mockResolvedValue({
      allowed: false,
      softLimited: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    })

    await ShortlinkPage({ params: Promise.resolve({ id: 'test12345' }) })

    expect(notFound).toHaveBeenCalled()
    expect(mockAdminDb.from).not.toHaveBeenCalled()
  })
})
