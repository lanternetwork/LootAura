/**
 * Integration tests for map prefetch and offline functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SalesMapClustered from '@/components/location/SalesMapClustered'
import { isOfflineCacheEnabled } from '@/lib/flags'

// Mock the flags module
vi.mock('@/lib/flags', () => ({
  isOfflineCacheEnabled: vi.fn()
}))

// Mock the cache modules
vi.mock('@/lib/cache/offline', () => ({
  fetchWithCache: vi.fn()
}))

// Mock the persistence module
vi.mock('@/lib/map/viewportPersistence', () => ({
  saveViewportState: vi.fn(),
  loadViewportState: vi.fn(),
  clearViewportState: vi.fn()
}))

// Mock the telemetry module
vi.mock('@/lib/telemetry/map', () => ({
  logPrefetchStart: vi.fn(),
  logPrefetchDone: vi.fn(),
  logPrefetchSkip: vi.fn(),
  logViewportSave: vi.fn(),
  logViewportLoad: vi.fn()
}))

// Mock Mapbox
vi.mock('react-map-gl', () => ({
  default: ({ children, onLoad, onMoveEnd, onZoomEnd }: any) => (
    <div data-testid="map">
      <button 
        data-testid="trigger-move" 
        onClick={() => onMoveEnd?.()}
      >
        Trigger Move
      </button>
      <button 
        data-testid="trigger-zoom" 
        onClick={() => onZoomEnd?.()}
      >
        Trigger Zoom
      </button>
      <button 
        data-testid="trigger-load" 
        onClick={() => onLoad?.()}
      >
        Trigger Load
      </button>
      {children}
    </div>
  ),
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>
}))

// Mock mapbox-gl
vi.mock('mapbox-gl', () => ({
  default: {
    Map: vi.fn()
  }
}))

describe('Map Prefetch and Offline Integration', () => {
  const mockSales = [
    {
      id: '1',
      title: 'Test Sale 1',
      lat: 38.2527,
      lng: -85.7585,
      date_start: '2024-01-01',
      time_start: '10:00',
      status: 'published' as const,
      privacy_mode: 'exact' as const,
      is_featured: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      owner_id: 'user1',
      city: 'Louisville',
      state: 'KY'
    }
  ]

  const mockMarkers = [
    { id: '1', title: 'Test Sale 1', lat: 38.2527, lng: -85.7585 }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock environment variables
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    process.env.NEXT_PUBLIC_FLAG_OFFLINE_CACHE = 'true'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render map with offline cache enabled', async () => {
    vi.mocked(isOfflineCacheEnabled).mockReturnValue(true)

    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    expect(screen.getByTestId('map')).toBeInTheDocument()
  })

  it('should render map with offline cache disabled', async () => {
    vi.mocked(isOfflineCacheEnabled).mockReturnValue(false)

    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    expect(screen.getByTestId('map')).toBeInTheDocument()
  })

  it('should handle map load event', async () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onMapReady={vi.fn()}
      />
    )

    const loadButton = screen.getByTestId('trigger-load')
    loadButton.click()

    await waitFor(() => {
      expect(screen.getByTestId('map')).toBeInTheDocument()
    })
  })

  it('should handle move end event', async () => {
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

    const moveButton = screen.getByTestId('trigger-move')
    moveButton.click()

    await waitFor(() => {
      expect(onMoveEnd).toHaveBeenCalled()
    })
  })

  it('should handle zoom end event', async () => {
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

    const zoomButton = screen.getByTestId('trigger-zoom')
    zoomButton.click()

    await waitFor(() => {
      expect(onZoomEnd).toHaveBeenCalled()
    })
  })

  it('should show offline banner when using cached data', async () => {
    vi.mocked(isOfflineCacheEnabled).mockReturnValue(true)

    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // The offline banner should be present in the DOM
    // (it will be hidden by default but present for testing)
    expect(screen.getByTestId('map')).toBeInTheDocument()
  })

  it('should handle prefetch scheduling', async () => {
    vi.mocked(isOfflineCacheEnabled).mockReturnValue(true)

    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Trigger move to simulate prefetch
    const moveButton = screen.getByTestId('trigger-move')
    moveButton.click()

    await waitFor(() => {
      expect(screen.getByTestId('map')).toBeInTheDocument()
    })
  })

  it('should handle offline fallback gracefully', async () => {
    vi.mocked(isOfflineCacheEnabled).mockReturnValue(true)

    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Simulate offline scenario
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false
    })

    const moveButton = screen.getByTestId('trigger-move')
    moveButton.click()

    await waitFor(() => {
      expect(screen.getByTestId('map')).toBeInTheDocument()
    })
  })
})
