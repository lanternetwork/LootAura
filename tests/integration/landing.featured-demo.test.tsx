import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import { FeaturedSalesSection } from '@/components/landing/FeaturedSalesSection'
import * as flagsModule from '@/lib/flags'

// Mock the flags module
vi.mock('@/lib/flags', () => ({
  isTestSalesEnabled: vi.fn(() => false),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock navigator.geolocation - return undefined to trigger fallback
Object.defineProperty(navigator, 'geolocation', {
  value: undefined,
  writable: true,
  configurable: true,
})

describe('FeaturedSalesSection with demo sales', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset default mock to return false
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)
    
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null)
    
    // Setup fetch mock
    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
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
    })
    global.fetch = fetchMock as typeof fetch
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows demo sales when flag is enabled', async () => {
    // Enable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(true)

    render(<FeaturedSalesSection />)

    // Wait for demo sales to appear
    await waitFor(
      () => {
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    // Verify demo sale titles appear
    const demoTitle1 = screen.queryByText(/Demo: Neighborhood Yard Sale/i)
    const demoTitle2 = screen.queryByText(/Demo: Multi-family Sale/i)
    expect(demoTitle1 || demoTitle2).toBeTruthy()
  })

  it('does not show demo sales when flag is disabled', async () => {
    // Keep flag disabled
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)

    render(<FeaturedSalesSection />)

    // Wait for component to finish loading
    await waitFor(
      () => {
        // Component should finish loading - wait for fetch to complete
        expect(fetchMock).toHaveBeenCalled()
      },
      { timeout: 3000 }
    )

    // Verify no demo badges appear
    const demoBadges = screen.queryAllByText('Demo')
    expect(demoBadges.length).toBe(0)
  })
})

