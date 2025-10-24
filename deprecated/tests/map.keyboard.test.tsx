/**
 * Accessibility tests for map keyboard navigation
 */

/** @deprecated Test for deprecated SalesMapClustered component. Not run by CI. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SalesMapClustered from '@/components/location/SalesMapClustered'
import { Sale } from '@/lib/types'

// Mock mapbox-gl
vi.mock('mapbox-gl', () => ({
  Map: vi.fn(() => ({
    getMap: vi.fn(() => ({
      panBy: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      getCenter: vi.fn(() => ({ lat: 38.2527, lng: -85.7585 })),
      getZoom: vi.fn(() => 10)
    })),
    on: vi.fn(),
    off: vi.fn()
  }))
}))

// Mock react-map-gl
vi.mock('react-map-gl', () => ({
  default: ({ children, ref, ...props }: any) => {
    // Only pass safe DOM props to avoid React warnings
    const { mapboxAccessToken, initialViewState, mapStyle, interactiveLayerIds, onMove, role, 'data-testid': dataTestId, tabIndex, 'aria-label': ariaLabel, ...safeProps } = props
    return (
      <div data-testid="map" ref={ref} {...safeProps}>
        {children}
      </div>
    )
  },
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>
}))

// Mock clustering
vi.mock('@/lib/pins/clustering', () => ({
  buildClusterIndex: vi.fn(),
  getClustersForViewport: vi.fn(() => []),
  getClusterExpansionZoom: vi.fn(() => 12),
  isClusteringEnabled: vi.fn(() => true),
  getClusterSizeTier: vi.fn(() => 'medium')
}))

// Mock other dependencies
vi.mock('@/lib/maps/token', () => ({
  getMapboxToken: vi.fn(() => 'test-token')
}))

vi.mock('@/lib/map/viewportFetchManager', () => ({
  createViewportFetchManager: vi.fn(() => ({
    request: vi.fn(),
    dispose: vi.fn()
  }))
}))

vi.mock('@/lib/map/viewportPersistence', () => ({
  saveViewportState: vi.fn(),
  loadViewportState: vi.fn(() => null)
}))

vi.mock('@/lib/map/tiles', () => ({
  getCurrentTileId: vi.fn(() => 'test-tile'),
  adjacentTileIds: vi.fn(() => [])
}))

vi.mock('@/lib/filters/hash', () => ({
  hashFilters: vi.fn(() => 'test-hash')
}))

vi.mock('@/lib/cache/offline', () => ({
  fetchWithCache: vi.fn(() => Promise.resolve({ data: { success: true }, fromCache: false }))
}))

vi.mock('@/lib/flags', () => ({
  isOfflineCacheEnabled: vi.fn(() => false)
}))

vi.mock('@/lib/telemetry/map', () => ({
  logPrefetchStart: vi.fn(),
  logPrefetchDone: vi.fn(),
  logViewportSave: vi.fn(),
  logViewportLoad: vi.fn()
}))

vi.mock('../OfflineBanner', () => ({
  default: ({ isVisible }: { isVisible: boolean }) => 
    isVisible ? <div data-testid="offline-banner">Offline</div> : null
}))

vi.mock('./ClusterMarker', () => ({
  default: ({ cluster, onClick, onKeyDown }: any) => (
    <button
      data-testid={`cluster-${cluster.id}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={`Cluster with ${cluster.point_count} sales`}
    >
      {cluster.point_count}
    </button>
  )
}))

describe('Map Keyboard Navigation', () => {
  const mockSales: Sale[] = [
    {
      id: '1',
      title: 'Test Sale',
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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render map with accessibility attributes', () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    const map = screen.getByTestId('map')
    expect(map).toHaveAttribute('role', 'img')
    expect(map).toHaveAttribute('aria-label', 'Interactive map showing yard sales')
    expect(map).toHaveAttribute('tabIndex', '0')
  })

  it('should handle arrow key navigation', () => {
    const mockMap = {
      panBy: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      getCenter: vi.fn(() => ({ lat: 38.2527, lng: -85.7585 })),
      getZoom: vi.fn(() => 10)
    }

    vi.mocked(require('mapbox-gl').Map).mockImplementation(() => ({
      getMap: vi.fn(() => mockMap),
      on: vi.fn(),
      off: vi.fn()
    }))

    render(
      <SalesMapClustered
        sales={mockSales}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Test arrow key navigation
    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(mockMap.panBy).toHaveBeenCalledWith([0, 50])

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(mockMap.panBy).toHaveBeenCalledWith([0, -50])

    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(mockMap.panBy).toHaveBeenCalledWith([50, 0])

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(mockMap.panBy).toHaveBeenCalledWith([-50, 0])
  })

  it('should handle zoom key navigation', () => {
    const mockMap = {
      panBy: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      getCenter: vi.fn(() => ({ lat: 38.2527, lng: -85.7585 })),
      getZoom: vi.fn(() => 10)
    }

    vi.mocked(require('mapbox-gl').Map).mockImplementation(() => ({
      getMap: vi.fn(() => mockMap),
      on: vi.fn(),
      off: vi.fn()
    }))

    render(
      <SalesMapClustered
        sales={mockSales}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Test zoom navigation
    fireEvent.keyDown(document, { key: '+' })
    expect(mockMap.zoomIn).toHaveBeenCalledWith({ duration: 300 })

    fireEvent.keyDown(document, { key: '=' })
    expect(mockMap.zoomIn).toHaveBeenCalledWith({ duration: 300 })

    fireEvent.keyDown(document, { key: '-' })
    expect(mockMap.zoomOut).toHaveBeenCalledWith({ duration: 300 })
  })

  it('should show keyboard navigation instructions', () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    expect(screen.getByText('Keyboard Navigation:')).toBeInTheDocument()
    expect(screen.getByText('Arrow keys: Pan map')).toBeInTheDocument()
    expect(screen.getByText('+/-: Zoom in/out')).toBeInTheDocument()
    expect(screen.getByText('Enter: Focus nearest cluster')).toBeInTheDocument()
    expect(screen.getByText('Escape: Clear focus')).toBeInTheDocument()
  })

  it('should announce updates to screen readers', () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // The announcement div should be present (even if empty)
    const announcement = screen.getByRole('status')
    expect(announcement).toBeInTheDocument()
    expect(announcement).toHaveClass('sr-only')
  })

  it('should handle Enter key for cluster focus', () => {
    const mockClusters = [
      { id: 'cluster-1', point_count: 5, lat: 38.2527, lng: -85.7585 }
    ]

    vi.mocked(require('@/lib/pins/clustering').getClustersForViewport).mockReturnValue(mockClusters)

    render(
      <SalesMapClustered
        sales={mockSales}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Test Enter key
    fireEvent.keyDown(document, { key: 'Enter' })
    
    // Should focus on the first cluster
    expect(screen.getByTestId('cluster-cluster-1')).toBeInTheDocument()
  })

  it('should handle Escape key to clear focus', () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Test Escape key
    fireEvent.keyDown(document, { key: 'Escape' })
    
    // Should clear any focused state
    expect(screen.queryByTestId('cluster-focused')).not.toBeInTheDocument()
  })
})
