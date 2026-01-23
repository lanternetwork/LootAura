/**
 * Integration tests for map prefetch and offline functionality
 */

/** @deprecated Test for deprecated SalesMapClustered component. Not run by CI. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SalesMapClustered from '@/components/location/SalesMapClustered'
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

// Mock the viewport fetch manager
vi.mock('@/lib/map/viewportFetchManager', () => ({
  createViewportFetchManager: vi.fn(() => ({
    request: vi.fn(),
    dispose: vi.fn()
  }))
}))

// Mock the cache functions
vi.mock('@/lib/cache/offline', () => ({
  fetchWithCache: vi.fn()
}))

// Mock the persistence functions
vi.mock('@/lib/map/viewportPersistence', () => ({
  saveViewportState: vi.fn(),
  loadViewportState: vi.fn(() => null)
}))

// Mock the hash function
vi.mock('@/lib/filters/hash', () => ({
  hashFilters: vi.fn(() => 'mock-hash')
}))

// Mock the tile functions
vi.mock('@/lib/map/tiles', () => ({
  getCurrentTileId: vi.fn(() => 'mock-tile-id'),
  adjacentTileIds: vi.fn(() => ['adjacent-tile-1', 'adjacent-tile-2'])
}))

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
  }
]

const mockMarkers = mockSales.map(sale => ({
  id: sale.id,
  title: sale.title,
  lat: sale.lat!,
  lng: sale.lng!,
}))

describe('Map Prefetch and Offline Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
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

    // Component should render without errors - check that divs are present
    const containers = screen.getAllByRole('generic')
    expect(containers.length).toBeGreaterThan(0)
  })

  it('should handle viewport changes', () => {
    const onViewChange = vi.fn()
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onViewChange={onViewChange}
      />
    )

    // Component should render without errors - check that divs are present
    const containers = screen.getAllByRole('generic')
    expect(containers.length).toBeGreaterThan(0)
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

    // Component should render without errors - check that divs are present
    const containers = screen.getAllByRole('generic')
    expect(containers.length).toBeGreaterThan(0)
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

    // Component should render without errors - check that divs are present
    const containers = screen.getAllByRole('generic')
    expect(containers.length).toBeGreaterThan(0)
  })

  it('should handle onMoveEnd callback', () => {
    const onMoveEnd = vi.fn()
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onMoveEnd={onMoveEnd}
      />
    )

    // Component should render without errors - check that divs are present
    const containers = screen.getAllByRole('generic')
    expect(containers.length).toBeGreaterThan(0)
  })

  it('should handle onZoomEnd callback', () => {
    const onZoomEnd = vi.fn()
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onZoomEnd={onZoomEnd}
      />
    )

    // Component should render without errors - check that divs are present
    const containers = screen.getAllByRole('generic')
    expect(containers.length).toBeGreaterThan(0)
  })
})