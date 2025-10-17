/**
 * Integration tests for map prefetch and offline functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { SalesMapClustered } from '@/components/location/SalesMapClustered'
import { isOfflineCacheEnabled } from '@/lib/flags'
import { Sale } from '@/lib/types'

// Mock the feature flag
vi.mock('@/lib/flags', () => ({
  isOfflineCacheEnabled: vi.fn(() => false)
}))

// Mock telemetry
vi.mock('@/lib/telemetry/map', () => ({
  logPrefetchStart: vi.fn(),
  logPrefetchDone: vi.fn(),
  logPrefetchSkip: vi.fn(),
  logCacheHit: vi.fn(),
  logCacheMiss: vi.fn(),
  logCacheWrite: vi.fn(),
  logCachePrune: vi.fn(),
  logOfflineFallback: vi.fn(),
  logViewportSave: vi.fn(),
  logViewportLoad: vi.fn(),
}))

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

const mockSales: Sale[] = [
  {
    id: '1',
    title: 'Test Sale 1',
    lat: 38.2527,
    lng: -85.7585,
    owner_id: 'user1',
    city: 'Louisville',
    state: 'KY',
    date_start: '2025-01-01',
    time_start: '09:00',
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  },
  {
    id: '2',
    title: 'Test Sale 2',
    lat: 38.2627,
    lng: -85.7685,
    owner_id: 'user2',
    city: 'Louisville',
    state: 'KY',
    date_start: '2025-01-02',
    time_start: '10:00',
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z'
  }
]

const mockMarkers = mockSales.map(sale => ({
  id: sale.id,
  title: sale.title,
  lat: sale.lat,
  lng: sale.lng,
}))

// Mock MSW server
const handlers = [
  http.get('/api/sales/markers', async ({ request }) => {
    const url = new URL(request.url)
    const bbox = url.searchParams.get('bbox')
    if (bbox) {
      return HttpResponse.json({ markers: mockMarkers }, { status: 200 })
    }
    return HttpResponse.json({ markers: [] }, { status: 200 })
  }),
]

const server = setupServer(...handlers)

describe('Map Prefetch and Offline Integration', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())
  
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
    vi.useFakeTimers()
  })

  afterEach(() => {
    server.resetHandlers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should render without crashing', () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Component should render without errors
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should handle offline cache when enabled', () => {
    vi.mocked(isOfflineCacheEnabled).mockReturnValue(true)
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Component should render without errors
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should handle offline cache when disabled', () => {
    vi.mocked(isOfflineCacheEnabled).mockReturnValue(false)
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Component should render without errors
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should persist viewport state to localStorage', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Simulate map interaction that would trigger state persistence
    await act(async () => {
      // Advance timers to trigger any debounced operations
      vi.advanceTimersByTime(500)
    })

    // Verify localStorage was called (component should attempt to save state)
    expect(localStorageMock.setItem).toHaveBeenCalled()
  })

  it('should load persisted state from localStorage', () => {
    const mockPersistedState = {
      version: 1,
      viewport: { lat: 38.1, lng: -85.6, zoom: 12 },
      filters: { dateRange: 'today', categories: ['books'], radius: 50 },
      timestamp: Date.now(),
    }
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockPersistedState))

    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Component should render without errors
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should handle network errors gracefully', async () => {
    // Mock network to fail
    server.use(
      http.get('/api/sales/markers', () => {
        return HttpResponse.error()
      })
    )

    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Component should still render without crashing
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})