import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { FeaturedSalesSection } from '@/components/landing/FeaturedSalesSection'
import * as flagsModule from '@/lib/flags'

// Mock the flags module
vi.mock('@/lib/flags', () => ({
  isTestSalesEnabled: vi.fn(() => false),
}))

// Note: useSearchParams is already mocked globally in tests/setup.ts
// We rely on that global mock and don't override it here to avoid React conflicts

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

describe('FeaturedSalesSection with demo sales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset default mock to return false
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)
    
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null)
    
    // Reset geolocation mock - don't provide geolocation, will fallback to default ZIP
    geolocationMock.getCurrentPosition.mockImplementation((success, error) => {
      // Immediately call error callback to trigger fallback to 40204
      if (error) {
        setTimeout(() => error(new Error('Geolocation denied')), 0)
      }
    })
    
    // Mock fetch to avoid network calls
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
  })

  afterEach(() => {
    cleanup()
  })

  it('shows demo sales when flag is enabled', async () => {
    // Enable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(true)

    render(<FeaturedSalesSection />)

    // Wait for demo sales to appear (component will fallback to 40204, fetch sales, then add demos)
    await waitFor(
      () => {
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )
  })

  it('does not show demo sales when flag is disabled', async () => {
    // Keep flag disabled (default)
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)

    render(<FeaturedSalesSection />)

    // Wait for component to finish loading
    await waitFor(
      () => {
        // Should not show demo badges when flag is disabled
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBe(0)
      },
      { timeout: 5000 }
    )
  })
})

