import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
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
    
    // Clear search params
    mockSearchParams.clear()
    
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
    mockSearchParams.set('zip', '40204')

    // Mock geocoding and sales API calls
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/geocoding/zip')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, lat: '38.2527', lng: '-85.7585', zip: '40204' }),
        })
      }
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
    mockSearchParams.set('zip', '40204')

    // Mock API calls
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/geocoding/zip')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, lat: '38.2527', lng: '-85.7585', zip: '40204' }),
        })
      }
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
        // Should show empty state, not demo sales
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBe(0)
      },
      { timeout: 5000 }
    )
  })
})

