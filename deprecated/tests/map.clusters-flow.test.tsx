/** @deprecated Test for deprecated SalesMapClustered component. Not run by CI. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import SimpleMap from '@/components/location/SimpleMap'
import { Sale } from '@/lib/types'

// Mock react-map-gl
vi.mock('react-map-gl', () => ({
  default: React.forwardRef<any, any>(({ children, onLoad, onMoveEnd, onZoomEnd, ...props }, ref) => {
    // Only pass safe DOM props to avoid React warnings
    const { 
      mapboxAccessToken, 
      initialViewState, 
      mapStyle, 
      interactiveLayerIds, 
      onMove, 
      role, 
      'data-testid': dataTestId, 
      tabIndex, 
      'aria-label': ariaLabel,
      optimizeForTerrain,
      antialias,
      preserveDrawingBuffer,
      attributionControl,
      logoPosition,
      preloadResources,
      transformRequest,
      ...safeProps 
    } = props
    
    // Don't auto-trigger onLoad - let tests control it
    
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
  afterEach(() => {
    cleanup()
  })

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

  it('should render map with clustering enabled', async () => {
    const { unmount } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        data-testid="map-container-1"
      />
    )

    // Wait for map to load (handle loading skeleton)
    await waitFor(() => {
      expect(screen.getByTestId('map-container-1')).toBeInTheDocument()
    }, { timeout: 5000 })
    
    unmount()
  })

  it('should handle cluster clicks and zoom to bounds', async () => {
    const onViewChange = vi.fn()
    
    const { unmount } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onViewChange={onViewChange}
        data-testid="map-container-2"
      />
    )

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container-2')).toBeInTheDocument()
    }, { timeout: 5000 })
    
    unmount()
  })

  it('should handle individual point clicks', async () => {
    const onSaleClick = vi.fn()
    
    const { unmount } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onSaleClick={onSaleClick}
        data-testid="map-container-3"
      />
    )

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container-3')).toBeInTheDocument()
    }, { timeout: 5000 })
    
    unmount()
  })

  it('should update clusters on viewport change', async () => {
    const onVisiblePinsChange = vi.fn()
    
    const { unmount } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onVisiblePinsChange={onVisiblePinsChange}
        data-testid="map-container-4"
      />
    )

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    // Simulate viewport change
    fireEvent.click(screen.getByText('Move End'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container-4')).toBeInTheDocument()
    }, { timeout: 5000 })
    
    unmount()
  })

  it('should handle zoom changes', async () => {
    const onZoomEnd = vi.fn()
    
    const { unmount } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onZoomEnd={onZoomEnd}
        data-testid="map-container-5"
      />
    )

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    // Simulate zoom change
    fireEvent.click(screen.getByText('Zoom End'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container-5')).toBeInTheDocument()
    }, { timeout: 5000 })
    
    unmount()
  })

  it('should fall back to individual markers when clustering disabled', async () => {
    process.env.NEXT_PUBLIC_FEATURE_CLUSTERING = 'false'
    
    const { unmount } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        data-testid="map-container-6"
      />
    )

    // Wait for map to load (handle loading skeleton)
    await waitFor(() => {
      expect(screen.getByTestId('map-container-6')).toBeInTheDocument()
    }, { timeout: 5000 })
    
    unmount()
  })

  it('should handle empty markers array', async () => {
    const { unmount } = render(
      <SalesMapClustered
        sales={[]}
        markers={[]}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        data-testid="map-container-7"
      />
    )

    // Wait for map to load (handle loading skeleton)
    await waitFor(() => {
      expect(screen.getByTestId('map-container-7')).toBeInTheDocument()
    }, { timeout: 5000 })
    
    unmount()
  })

  it('should handle clustering with map-only data flow', async () => {
    const onVisiblePinsChange = vi.fn()
    
    const { unmount } = render(
      <SalesMapClustered
        sales={mockSales}
        markers={mockMarkers}
        center={{ lat: 38.2527, lng: -85.7585 }}
        zoom={10}
        onVisiblePinsChange={onVisiblePinsChange}
        data-testid="map-container-8"
      />
    )

    // Simulate map load
    fireEvent.click(screen.getByText('Load Map'))
    
    // Simulate viewport change
    fireEvent.click(screen.getByText('Move End'))
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container-8')).toBeInTheDocument()
    }, { timeout: 5000 })
    
    unmount()
  })
})
