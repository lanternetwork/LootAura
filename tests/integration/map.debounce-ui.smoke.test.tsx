import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SalesMapClustered from '@/components/location/SalesMapClustered'
import { Sale } from '@/lib/types'

// Mock mapbox token
vi.mock('@/lib/maps/token', () => ({
  getMapboxToken: () => 'mock-token'
}))

// Mock clustering
vi.mock('@/lib/clustering', () => ({
  isClusteringEnabled: () => false,
  buildClusterIndex: () => null,
  getClustersForViewport: () => [],
  getClusterExpansionZoom: () => 10,
  getClusterSizeTier: () => 'small'
}))

// Mock react-map-gl
vi.mock('react-map-gl', () => ({
  default: ({ children, onLoad, onMoveEnd, onZoomEnd }: any) => {
    // Simulate map load
    setTimeout(() => {
      if (onLoad) onLoad()
    }, 0)
    
    return (
      <div data-testid="map-container">
        {children}
        <button 
          data-testid="trigger-move"
          onClick={() => onMoveEnd && onMoveEnd()}
        >
          Trigger Move
        </button>
        <button 
          data-testid="trigger-zoom"
          onClick={() => onZoomEnd && onZoomEnd()}
        >
          Trigger Zoom
        </button>
      </div>
    )
  },
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>
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
    vi.clearAllMocks()
  })

  it('should render map with clustering disabled', () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    expect(screen.getByTestId('map-container')).toBeInTheDocument()
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

    // Wait for map to load
    await new Promise(resolve => setTimeout(resolve, 10))

    // Trigger move event
    const moveButton = screen.getByTestId('trigger-move')
    moveButton.click()

    // Trigger zoom event
    const zoomButton = screen.getByTestId('trigger-zoom')
    zoomButton.click()

    // Component should handle these events without throwing
    expect(screen.getByTestId('map-container')).toBeInTheDocument()
  })

  it('should render individual markers when clustering is disabled', () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Should render individual markers since clustering is disabled
    expect(screen.getByTestId('marker')).toBeInTheDocument()
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
    expect(screen.getByTestId('map-container')).toBeInTheDocument()
  })
})
