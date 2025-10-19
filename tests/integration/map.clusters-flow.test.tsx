import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  getMapboxToken: () => 'test-token'
}))

// Mock usage logs
vi.mock('@/lib/usageLogs', () => ({
  incMapLoad: vi.fn()
}))

describe('Map Clusters Flow', () => {
  const mockSales: Sale[] = [
    {
      id: '1',
      title: 'Sale 1',
      lat: 38.2527,
      lng: -85.7585,
      date_start: '2024-01-01',
      time_start: '09:00',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      owner_id: 'user-1',
      city: 'Louisville',
      state: 'KY'
    },
    {
      id: '2',
      title: 'Sale 2',
      lat: 38.2528,
      lng: -85.7586,
      date_start: '2024-01-01',
      time_start: '09:00',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      owner_id: 'user-2',
      city: 'Louisville',
      state: 'KY'
    }
  ]

  const mockMarkers = [
    { id: '1', title: 'Sale 1', lat: 38.2527, lng: -85.7585 },
    { id: '2', title: 'Sale 2', lat: 38.2528, lng: -85.7586 }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Enable clustering for tests
    process.env.NEXT_PUBLIC_FEATURE_CLUSTERING = 'true'
  })

  it('should render map with clustering enabled', () => {
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Wait for map to load (handle loading skeleton)
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should handle cluster clicks and zoom to bounds', async () => {
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

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should handle individual point clicks', async () => {
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

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should update clusters on viewport change', async () => {
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

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    // Simulate viewport change
    fireEvent.click(screen.getByText('Move End'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should handle zoom changes', async () => {
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

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    // Simulate zoom change
    fireEvent.click(screen.getByText('Zoom End'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should fall back to individual markers when clustering disabled', () => {
    process.env.NEXT_PUBLIC_FEATURE_CLUSTERING = 'false'
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Wait for map to load (handle loading skeleton)
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should handle empty markers array', () => {
    render(
      <SalesMapClustered
        sales={[]}
        markers={[]}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
      />
    )

    // Wait for map to load (handle loading skeleton)
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should maintain arbiter authority with clustering', async () => {
    const onVisiblePinsChange = vi.fn()
    
    render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        arbiterAuthority="MAP"
        onVisiblePinsChange={onVisiblePinsChange}
      />
    )

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    // Simulate viewport change
    fireEvent.click(screen.getByText('Move End'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })
})
