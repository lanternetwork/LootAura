import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { FeaturedSalesSection } from '@/components/landing/FeaturedSalesSection'
import * as flagsModule from '@/lib/flags'
import { useSearchParams } from 'next/navigation'

// Mock the flags module
vi.mock('@/lib/flags', () => ({
  isTestSalesEnabled: vi.fn(() => false),
}))

// Mock next/navigation - use same pattern as other integration tests
const mockSearchParams = new Map<string, string>()

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    get: (key: string) => mockSearchParams.get(key) || null,
    has: (key: string) => mockSearchParams.has(key),
  })),
}))

// Mock next/link to avoid navigation issues in tests
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// Mock FavoriteButton to avoid auth/API dependencies
vi.mock('@/components/FavoriteButton', () => ({
  default: () => null,
}))

// Mock SaleCardSkeleton to simplify rendering
vi.mock('@/components/SaleCardSkeleton', () => ({
  default: () => <div data-testid="sale-card-skeleton">Loading...</div>,
}))

describe('FeaturedSalesSection with demo sales', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let originalFetch: typeof fetch
  let originalLocalStorage: Storage | undefined
  let originalGeolocation: Geolocation | undefined
  let localStorageMock: {
    getItem: ReturnType<typeof vi.fn>
    setItem: ReturnType<typeof vi.fn>
    removeItem: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset search params
    mockSearchParams.clear()
    
    // Reset default mock to return false
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)
    
    // Save original values (safely)
    originalFetch = global.fetch
    originalLocalStorage = typeof window !== 'undefined' ? window.localStorage : undefined
    originalGeolocation = typeof navigator !== 'undefined' && 'geolocation' in navigator 
      ? navigator.geolocation 
      : undefined
    
    // Setup localStorage mock
    localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    })
    
    // Make geolocation unavailable to trigger immediate fallback to default ZIP
    // Mock getCurrentPosition to call error callback synchronously
    // This triggers the fallback ZIP code path
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success, error) => {
        // Call error callback synchronously to trigger fallback
        if (error) {
          error(new Error('Geolocation not available'))
        }
      }),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    }
    
    // Define mock geolocation so 'geolocation' in navigator returns true
    // but getCurrentPosition will call error callback
    Object.defineProperty(navigator, 'geolocation', {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    })
    
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
    
    // Restore original values to avoid interfering with other tests
    global.fetch = originalFetch
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      })
    }
    // Restore geolocation if it existed
    if (originalGeolocation !== undefined) {
      Object.defineProperty(navigator, 'geolocation', {
        value: originalGeolocation,
        writable: true,
        configurable: true,
      })
    } else {
      // If it didn't exist, try to delete it
      try {
        delete (navigator as any).geolocation
      } catch {
        // Ignore if delete fails
      }
    }
  })

  it('shows demo sales when flag is enabled', async () => {
    // Enable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(true)

    render(<FeaturedSalesSection />)

    // Wait for demo sales to appear - component should resolve location and fetch
    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalled()
      },
      { timeout: 3000 }
    )

    // Wait a bit more for demo sales to render
    await waitFor(
      () => {
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBeGreaterThan(0)
      },
      { timeout: 2000 }
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

    // Wait a bit for component to render and verify no demo badges appear
    await waitFor(
      () => {
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBe(0)
      },
      { timeout: 1000 }
    )
  })
})

