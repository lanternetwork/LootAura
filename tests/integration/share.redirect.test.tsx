/**
 * Integration tests for share redirect functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { notFound, redirect } from 'next/navigation'
import ShortlinkPage from '@/app/s/[id]/page'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Mock Next.js navigation (notFound/redirect throw in real Next.js)
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: vi.fn()
}))

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn()
}))

// Mock URL state serialization
vi.mock('@/lib/url/state', () => ({
  serializeState: vi.fn((state) => `lat=${state.view.lat}&lng=${state.view.lng}&zoom=${state.view.zoom}`)
}))

describe('Share Redirect Integration', () => {
  const mockSupabase = {
    from: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should redirect to explore page with serialized state', async () => {
    const mockState = {
      view: { lat: 40.7128, lng: -74.006, zoom: 12 },
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
    mockSupabase.from.mockReturnValue({ select: mockSelect })

    const { serializeState } = await import('@/lib/url/state')
    vi.mocked(serializeState).mockReturnValue('lat=40.7128&lng=-74.006&zoom=12')

    await ShortlinkPage({ params: { id: 'test12345' } })

    expect(mockSupabase.from).toHaveBeenCalledWith('shared_states')
    expect(serializeState).toHaveBeenCalledWith(mockState)
    expect(redirect).toHaveBeenCalledWith('/explore?lat=40.7128&lng=-74.006&zoom=12')
  })

  it('should call notFound for invalid short ID', async () => {
    await expect(ShortlinkPage({ params: { id: '' } })).rejects.toThrow('NEXT_NOT_FOUND')
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
    mockSupabase.from.mockReturnValue({ select: mockSelect })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(ShortlinkPage({ params: { id: 'nonexistent' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('should handle database errors gracefully', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockRejectedValue(new Error('Database error'))
      })
    })
    mockSupabase.from.mockReturnValue({ select: mockSelect })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(ShortlinkPage({ params: { id: 'test12345' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(consoleSpy).toHaveBeenCalled()
    expect(notFound).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})