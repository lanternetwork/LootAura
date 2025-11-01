/**
 * Integration tests for local preset management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { usePresets } from '@/lib/hooks/usePresets'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }))
}))

describe('Local Preset Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    localStorageMock.clear()
  })

  it('should load empty presets when localStorage is empty', async () => {
    const { result } = renderHook(() => usePresets())

    expect(result.current.loading).toBe(true)
    expect(result.current.presets).toEqual([])
    expect(result.current.isSignedIn).toBe(false)
  })

  it('should load presets from localStorage', async () => {
    const mockPresets = [
      {
        id: 'local_123',
        name: 'Test Preset',
        state: { view: { lat: 40.7128, lng: -74.0060, zoom: 12 }, filters: { dateRange: 'today', categories: [], radius: 25 } },
        isDefault: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        version: 1
      }
    ]

    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      presets: mockPresets,
      version: 1
    }))

    const { result } = renderHook(() => usePresets())

    // Wait for loading to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.presets).toHaveLength(1)
    expect(result.current.presets[0].name).toBe('Test Preset')
  })

  it('should clear old data on version mismatch', async () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      presets: [],
      version: 0 // Old version
    }))

    const { result } = renderHook(() => usePresets())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('savedPresets')
    expect(result.current.presets).toEqual([])
  })

  it('should save preset to localStorage', async () => {
    const { result } = renderHook(() => usePresets())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const testState = {
      view: { lat: 40.7128, lng: -74.0060, zoom: 12 },
      filters: { dateRange: 'today', categories: ['furniture'], radius: 50 }
    }

    await act(async () => {
      await result.current.savePreset('New Preset', testState)
    })

    expect(localStorageMock.setItem).toHaveBeenCalled()
    const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1])
    expect(savedData.presets).toHaveLength(1)
    expect(savedData.presets[0].name).toBe('New Preset')
    expect(savedData.presets[0].state).toEqual(testState)
  })

  it('should delete preset from localStorage', async () => {
    const mockPresets = [
      {
        id: 'local_123',
        name: 'Test Preset',
        state: { view: { lat: 40.7128, lng: -74.0060, zoom: 12 }, filters: { dateRange: 'today', categories: [], radius: 25 } },
        isDefault: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        version: 1
      }
    ]

    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      presets: mockPresets,
      version: 1
    }))

    const { result } = renderHook(() => usePresets())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    await act(async () => {
      await result.current.deletePreset('local_123')
    })

    expect(localStorageMock.setItem).toHaveBeenCalled()
    const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1])
    expect(savedData.presets).toHaveLength(0)
  })

  it('should set default preset', async () => {
    const mockPresets = [
      {
        id: 'local_123',
        name: 'Preset 1',
        state: { view: { lat: 40.7128, lng: -74.0060, zoom: 12 }, filters: { dateRange: 'today', categories: [], radius: 25 } },
        isDefault: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        version: 1
      },
      {
        id: 'local_456',
        name: 'Preset 2',
        state: { view: { lat: 40.7128, lng: -74.0060, zoom: 12 }, filters: { dateRange: 'today', categories: [], radius: 25 } },
        isDefault: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        version: 1
      }
    ]

    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      presets: mockPresets,
      version: 1
    }))

    const { result } = renderHook(() => usePresets())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    await act(async () => {
      await result.current.setDefaultPreset('local_123')
    })

    expect(localStorageMock.setItem).toHaveBeenCalled()
    const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1])
    expect(savedData.presets[0].isDefault).toBe(true)
    expect(savedData.presets[1].isDefault).toBe(false)
  })
})
