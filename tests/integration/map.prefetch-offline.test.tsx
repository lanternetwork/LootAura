/**
 * Integration tests for map prefetch and offline functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  lat: sale.lat,
  lng: sale.lng,
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
})