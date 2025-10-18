/**
 * Integration tests for map prefetch and offline functionality
 */

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

// Mock the tile functions
vi.mock('@/lib/map/tiles', () => ({
  getCurrentTileId: vi.fn(() => 'test-tile-id'),
  adjacentTileIds: vi.fn(() => ['adjacent-1', 'adjacent-2'])
}))

// Mock the filter hash function
vi.mock('@/lib/filters/hash', () => ({
  hashFilters: vi.fn(() => 'test-hash')
}))

// Mock the persistence functions
vi.mock('@/lib/map/viewportPersistence', () => ({
  saveViewportState: vi.fn(),
  loadViewportState: vi.fn(() => null)
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
] as Sale[]

const mockMarkers = mockSales.map(sale => ({
  id: sale.id,
  title: sale.title,
  lat: sale.lat as number,
  lng: sale.lng as number,
}))

describe('Map Prefetch and Offline Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render without crashing', () => {
    const { container } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Component should render without errors - check for map container div
    expect(container.querySelector('.w-full.h-full')).toBeInTheDocument()
  })

  it('should handle offline cache when enabled', () => {
    vi.mocked(isOfflineCacheEnabled).mockReturnValue(true)
    
    const { container } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Component should render without errors
    expect(container.querySelector('.w-full.h-full')).toBeInTheDocument()
  })

  it('should handle offline cache when disabled', () => {
    vi.mocked(isOfflineCacheEnabled).mockReturnValue(false)
    
    const { container } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Component should render without errors
    expect(container.querySelector('.w-full.h-full')).toBeInTheDocument()
  })
})