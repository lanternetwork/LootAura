import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FeaturedSalesSection } from '@/components/landing/FeaturedSalesSection'
import * as flagsModule from '@/lib/flags'

// Mock the flags module
vi.mock('@/lib/flags', () => ({
  isTestSalesEnabled: vi.fn(() => false),
}))

// Mock next/navigation
const mockSearchParams = new Map<string, string>()
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) || null,
    has: (key: string) => mockSearchParams.has(key),
  }),
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
})

// Mock navigator.geolocation
const geolocationMock = {
  getCurrentPosition: vi.fn((success, error) => {
    // Default to fallback (error callback)
    if (error) {
      error()
    }
  }),
}
Object.defineProperty(navigator, 'geolocation', {
  value: geolocationMock,
})

// Mock fetch
global.fetch = vi.fn()

describe('FeaturedSalesSection with demo sales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset default mock to return false
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)
    
    // Clear search params
    mockSearchParams.clear()
    
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null)
    
    // Reset geolocation mock to fallback behavior
    geolocationMock.getCurrentPosition.mockImplementation((success, error) => {
      if (error) error()
    })
  })

  it('shows demo sales when flag is enabled', async () => {
    // Enable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(true)

    // Mock geocoding API call
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/geocoding/zip')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, lat: '38.2527', lng: '-85.7585', zip: '40204' }),
        })
      }
      // Mock sales API call
      if (url.includes('/api/sales')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sales: [] }),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`))
    })

    render(<FeaturedSalesSection />)

    // Wait for component to render and check for demo sales
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

    // Mock geocoding API call
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/geocoding/zip')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, lat: '38.2527', lng: '-85.7585', zip: '40204' }),
        })
      }
      // Mock sales API call
      if (url.includes('/api/sales')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sales: [] }),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`))
    })

    render(<FeaturedSalesSection />)

    // Wait for component to render
    await waitFor(
      () => {
        // Should not show demo badges when flag is disabled
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBe(0)
      },
      { timeout: 5000 }
    )
  })

  it('shows demo badge on demo sale cards', async () => {
    // Enable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(true)

    // Mock geocoding API call
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/geocoding/zip')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, lat: '38.2527', lng: '-85.7585', zip: '40204' }),
        })
      }
      // Mock sales API call
      if (url.includes('/api/sales')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sales: [] }),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`))
    })

    render(<FeaturedSalesSection />)

    // Wait for demo sales to appear
    await waitFor(
      () => {
        // Should find demo sale titles
        const demoTitle1 = screen.queryByText(/Demo: Neighborhood Yard Sale/i)
        const demoTitle2 = screen.queryByText(/Demo: Multi-family Sale/i)
        expect(demoTitle1 || demoTitle2).toBeTruthy()

        // Should show demo badges
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )
  })
})

