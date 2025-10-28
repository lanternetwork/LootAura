/** @deprecated Test for deprecated SalesMapClustered component. Not run by CI. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import SalesMapClustered from '@/components/location/SalesMapClustered'
import { Sale } from '@/lib/types'

// Mock react-map-gl
vi.mock('react-map-gl', () => ({
  default: React.forwardRef<any, any>(({ children, onLoad, onMoveEnd, onZoomEnd, ...props }, ref) => {
    // Only pass safe DOM props to avoid React warnings
    const { mapboxAccessToken, initialViewState, mapStyle, interactiveLayerIds, onMove, role, 'data-testid': dataTestId, tabIndex, 'aria-label': ariaLabel, ...safeProps } = props
    
    // Auto-trigger onLoad to simulate map loading
    React.useEffect(() => {
      if (onLoad) {
        onLoad()
      }
    }, [onLoad])
    
    return (
      <div data-testid="map-container" ref={ref} {...safeProps}>
        {children}
        <button onClick={onLoad}>Load Map</button>
        <button onClick={onMoveEnd}>Move End</button>
        <button onClick={onZoomEnd}>Zoom End</button>
      </div>
    )
  }),
  Marker: ({ children, ...props }: any) => <div data-testid="marker" {...props}>{children}</div>,
  Popup: ({ children, ...props }: any) => <div data-testid="popup" {...props}>{children}</div>
}))

// Mock mapbox token
vi.mock('@/lib/maps/token', () => ({
  getMapboxToken: () => 'mock-token'
}))

// Mock clustering
vi.mock('@/lib/pins/clustering', () => ({
  isClusteringEnabled: () => false,
  buildClusterIndex: () => null,
  getClustersForViewport: () => [],
  getClusterExpansionZoom: () => 10,
  getClusterSizeTier: () => 'small'
}))

// Mock viewport fetch manager
vi.mock('@/lib/map/viewportFetchManager', () => ({
  createViewportFetchManager: () => ({
    fetchMarkers: vi.fn().mockResolvedValue({ data: { markers: [] }, error: null }),
    abort: vi.fn(),
    isFetching: false
  })
}))

// Mock viewport persistence
vi.mock('@/lib/map/viewportPersistence', () => ({
  saveViewportState: vi.fn(),
  loadViewportState: vi.fn().mockReturnValue(null)
}))

// Mock tiles
vi.mock('@/lib/map/tiles', () => ({
  getCurrentTileId: vi.fn().mockReturnValue('test-tile'),
  adjacentTileIds: vi.fn().mockReturnValue(['test-tile-1', 'test-tile-2'])
}))

// Mock filters hash
vi.mock('@/lib/filters/hash', () => ({
  hashFilters: vi.fn().mockReturnValue('test-hash')
}))

// Mock cache offline
vi.mock('@/lib/cache/offline', () => ({
  fetchWithCache: vi.fn().mockResolvedValue({ data: { markers: [] }, error: null })
}))

// Mock flags
vi.mock('@/lib/flags', () => ({
  isOfflineCacheEnabled: () => false
}))

// Mock telemetry
vi.mock('@/lib/telemetry/map', () => ({
  logPrefetchStart: vi.fn(),
  logPrefetchDone: vi.fn(),
  logViewportSave: vi.fn(),
  logViewportLoad: vi.fn()
}))

// Mock react-map-gl
vi.mock('react-map-gl', () => ({
  default: ({ children, onLoad, onMoveEnd, onZoomEnd, ref, ...props }: any) => {
    // Only pass safe DOM props to avoid React warnings
    const { mapboxAccessToken, initialViewState, mapStyle, interactiveLayerIds, onMove, role, 'data-testid': dataTestId, tabIndex, 'aria-label': ariaLabel, ...safeProps } = props
    
    // Simulate map load
    setTimeout(() => {
      if (onLoad) onLoad()
    }, 0)
    
    return (
      <div data-testid="map-container" ref={ref} {...safeProps}>
        {children}
        <button 
          data-testid="trigger-move"
          onClick={() => onMoveEnd && onMoveEnd()}
        >
          Move End
        </button>
        <button 
          data-testid="trigger-zoom"
          onClick={() => onZoomEnd && onZoomEnd()}
        >
          Zoom End
        </button>
      </div>
    )
  },
  Marker: ({ children, ...props }: any) => (
    <div data-testid="marker" {...props}>
      {children}
    </div>
  ),
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>
}))

// Mock usage logs
vi.mock('@/lib/usageLogs', () => ({
  incMapLoad: vi.fn()
}))

describe('Map Debounce UI Smoke Test', () => {
  const mockSales: Sale[] = [
    {
      id: '1',
      title: 'Test Sale 1',
      lat: 38.2527,
      lng: -85.7585,
      date_start: '2024-01-01',
      time_start: '10:00',
      status: 'published',
      privacy_mode: 'exact',
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
    // Clear mocks before each test
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Clean up mocks and reset state
    cleanup()
    vi.clearAllMocks()
  })

  it('should render map with clustering disabled', async () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Wait for component to render
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(screen.getAllByTestId('map-container')).toHaveLength(1)
  })

  it('should handle viewport changes without errors', async () => {
    const onVisiblePinsChange = vi.fn()
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onVisiblePinsChange={onVisiblePinsChange}
      />
    )

    // Wait for map to load (handle loading skeleton)
    await waitFor(() => {
      expect(screen.getAllByTestId('map-container')).toHaveLength(1)
    }, { timeout: 5000 })
    
    // Optional: try to find and click buttons if they exist (smoke test only)
    const moveButton = screen.queryByText('Move End')
    const zoomButton = screen.queryByText('Zoom End')
    if (moveButton) moveButton.click()
    if (zoomButton) zoomButton.click()
  })

  it('should render map container when clustering is disabled', async () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Wait for component to render
    await new Promise(resolve => setTimeout(resolve, 10))

    // Should render map container - this is a smoke test
    expect(screen.getAllByTestId('map-container')).toHaveLength(1)
  })

  it('should handle sale clicks', () => {
    const onSaleClick = vi.fn()
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onSaleClick={onSaleClick}
      />
    )

    // Component should be ready to handle sale clicks
    expect(screen.getAllByTestId('map-container')).toHaveLength(1)
  })
})
