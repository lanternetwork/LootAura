import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import { FeaturedSalesSection } from '@/components/landing/FeaturedSalesSection'
import * as flagsModule from '@/lib/flags'

// Mock the flags module
vi.mock('@/lib/flags', () => ({
  isTestSalesEnabled: vi.fn(() => false),
}))

// Mock next/navigation
const mockSearchParamsGet = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => {
    const searchParams = new URLSearchParams()
    // Create a mock ReadonlyURLSearchParams-like object
    return {
      get: mockSearchParamsGet,
      has: vi.fn(),
      toString: vi.fn(() => searchParams.toString()),
      entries: vi.fn(() => searchParams.entries()),
      keys: vi.fn(() => searchParams.keys()),
      values: vi.fn(() => searchParams.values()),
      forEach: vi.fn((callback) => searchParams.forEach(callback)),
      [Symbol.iterator]: vi.fn(() => searchParams[Symbol.iterator]()),
    } as any
  },
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock navigator.geolocation
const geolocationMock = {
  getCurrentPosition: vi.fn(),
}
Object.defineProperty(navigator, 'geolocation', {
  value: geolocationMock,
  writable: true,
})

// Mock fetch
global.fetch = vi.fn()

describe('FeaturedSalesSection with demo sales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset default mock to return false
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)
    
    // Reset search params mock
    mockSearchParamsGet.mockReturnValue(null)
    
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null)
    
    // Reset geolocation mock to immediately fallback (no geolocation)
    geolocationMock.getCurrentPosition.mockImplementation((success, error) => {
      // Immediately call error callback to trigger fallback
      if (error) {
        setTimeout(() => error(), 0)
      }
    })
    
    // Mock fetch to avoid network calls
    global.fetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows demo sales when flag is enabled and no real sales', async () => {
    // Enable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(true)

    // Set up ZIP in URL to avoid geolocation
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'zip' || key === 'postal') return '40204'
      return null
    })

    // Mock geocoding and sales API calls
    let fetchCallCount = 0
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      fetchCallCount++
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/api/geocoding/zip')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, lat: '38.2527', lng: '-85.7585', zip: '40204' }),
        } as Response)
      }
      if (url.includes('/api/sales')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sales: [] }),
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`))
    }) as typeof fetch

    await act(async () => {
      render(<FeaturedSalesSection />)
    })

    // Wait for all async operations to complete and demo sales to appear
    await waitFor(
      () => {
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )
  })

  it('does not show demo sales when flag is disabled', async () => {
    // Disable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)

    // Set up ZIP in URL to avoid geolocation
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'zip' || key === 'postal') return '40204'
      return null
    })

    // Mock API calls
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/api/geocoding/zip')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, lat: '38.2527', lng: '-85.7585', zip: '40204' }),
        } as Response)
      }
      if (url.includes('/api/sales')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sales: [] }),
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`))
    }) as typeof fetch

    await act(async () => {
      render(<FeaturedSalesSection />)
    })

    // Wait for component to render and all async operations to complete
    await waitFor(
      () => {
        // Should show empty state, not demo sales
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBe(0)
      },
      { timeout: 5000 }
    )
  })
})

