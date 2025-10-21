/**
 * Integration tests for cluster functionality
 * Tests cluster click behavior, visible pins updates, and sales list rendering
 */

import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SalesMapClustered from '@/components/location/SalesMapClustered'
import { Sale } from '@/lib/types'

// Mock the debug system
vi.mock('@/lib/debug/clusterDebug', () => ({
  default: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
    logClusterClick: vi.fn(),
    logClusterChildren: vi.fn(),
    logVisiblePinsUpdate: vi.fn(),
    logClusterIndex: vi.fn(),
    logClusterExpansion: vi.fn(),
    logClusterAnimation: vi.fn(),
    logClusterState: vi.fn(),
    logClusterPerformance: vi.fn(),
    logClusterError: vi.fn(),
    logTestStart: vi.fn(),
    logTestResult: vi.fn()
  }
}))

// Mock mapbox
vi.mock('react-map-gl', () => ({
  default: ({ children, onLoad, onMoveEnd, onZoomEnd, onViewStateChange }: any) => {
    const mockMap = {
      getBounds: () => ({
        getWest: () => -85.8,
        getSouth: () => 38.2,
        getEast: () => -85.7,
        getNorth: () => 38.3
      }),
      getZoom: () => 12,
      easeTo: vi.fn(),
      getCenter: () => ({ lat: 38.25, lng: -85.75 })
    }

    // Simulate map load
    React.useEffect(() => {
      if (onLoad) onLoad()
    }, [])

    return (
      <div data-testid="map-container">
        {children}
        <button 
          data-testid="simulate-move-end"
          onClick={() => onMoveEnd?.()}
        >
          Simulate Move End
        </button>
        <button 
          data-testid="simulate-zoom-end"
          onClick={() => onZoomEnd?.()}
        >
          Simulate Zoom End
        </button>
        <button 
          data-testid="simulate-view-change"
          onClick={() => onViewStateChange?.({
            viewState: { center: [38.25, -85.75], zoom: 13 }
          })}
        >
          Simulate View Change
        </button>
      </div>
    )
  },
  Marker: ({ children, longitude, latitude }: any) => (
    <div 
      data-testid="marker" 
      data-longitude={longitude} 
      data-latitude={latitude}
    >
      {children}
    </div>
  )
}))

// Mock clustering
vi.mock('@/lib/clustering', () => ({
  isClusteringEnabled: vi.fn(() => true),
  buildClusterIndex: vi.fn(() => ({
    getClusters: vi.fn(() => []),
    getChildren: vi.fn((clusterId: number) => [
      { id: 'sale-1', type: 'point', lat: 38.25, lon: -85.75 },
      { id: 'sale-2', type: 'point', lat: 38.26, lon: -85.76 }
    ]),
    getLeaves: vi.fn(),
    getClusterExpansionZoom: vi.fn(() => 15),
    getTile: vi.fn()
  })),
  getClustersForViewport: vi.fn(() => [
    { id: 'cluster-1', type: 'cluster', lat: 38.25, lon: -85.75, count: 2 }
  ]),
  getClusterExpansionZoom: vi.fn(() => 15),
  getClusterSizeTier: vi.fn(() => 'medium')
}))

// Mock mapbox token
vi.mock('@/lib/maps/token', () => ({
  getMapboxToken: () => 'pk.test'
}))

// Mock viewport fetch manager
vi.mock('@/lib/map/viewportFetchManager', () => ({
  createViewportFetchManager: () => ({
    request: vi.fn(),
    dispose: vi.fn()
  })
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

// Mock debug
vi.mock('@/lib/debug/mapDebug', () => ({
  default: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
    logMapLoad: vi.fn(),
    logTokenStatus: vi.fn(),
    logMapState: vi.fn(),
    logPerformance: vi.fn()
  }
}))

const mockSales: Sale[] = [
  {
    id: 'sale-1',
    title: 'Test Sale 1',
    description: 'Test description',
    lat: 38.25,
    lng: -85.75,
    address: '123 Test St',
    city: 'Test City',
    state: 'KY',
    zip: '40201',
    start_date: '2025-01-01',
    end_date: '2025-01-02',
    start_time: '09:00',
    end_time: '17:00',
    categories: ['electronics'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    user_id: 'user-1'
  },
  {
    id: 'sale-2',
    title: 'Test Sale 2',
    description: 'Test description 2',
    lat: 38.26,
    lng: -85.76,
    address: '456 Test Ave',
    city: 'Test City',
    state: 'KY',
    zip: '40202',
    start_date: '2025-01-01',
    end_date: '2025-01-02',
    start_time: '10:00',
    end_time: '18:00',
    categories: ['furniture'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    user_id: 'user-2'
  }
]

const mockMarkers = mockSales.map(sale => ({
  id: sale.id,
  title: sale.title,
  lat: sale.lat,
  lng: sale.lng
}))

describe('Cluster Functionality Integration Tests', () => {
  let queryClient: QueryClient
  let onVisiblePinsChange: vi.Mock
  let onViewChange: vi.Mock

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
    
    onVisiblePinsChange = vi.fn()
    onViewChange = vi.fn()
    
    // Set debug environment
    process.env.NEXT_PUBLIC_DEBUG = 'true'
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.NEXT_PUBLIC_DEBUG
  })

  const renderClusterMap = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SalesMapClustered
          sales={mockSales}
          markers={mockMarkers}
          center={{ lat: 38.25, lng: -85.75 }}
          zoom={10}
          onVisiblePinsChange={onVisiblePinsChange}
          onViewChange={onViewChange}
          {...props}
        />
      </QueryClientProvider>
    )
  }

  describe('Cluster Click Behavior', () => {
    it('should handle cluster click and update visible pins', async () => {
      renderClusterMap()

      // Wait for map to load
      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      // Simulate cluster click
      const clusterMarker = screen.getByTestId('marker')
      fireEvent.click(clusterMarker)

      // Verify onVisiblePinsChange was called with child points
      await waitFor(() => {
        expect(onVisiblePinsChange).toHaveBeenCalledWith(
          ['sale-1', 'sale-2'],
          2
        )
      })
    })

    it('should handle cluster click with debug logging', async () => {
      const clusterDebug = await import('@/lib/debug/clusterDebug')
      
      renderClusterMap()

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      const clusterMarker = screen.getByTestId('marker')
      fireEvent.click(clusterMarker)

      // Verify debug logging was called
      expect(clusterDebug.default.logClusterClick).toHaveBeenCalled()
      expect(clusterDebug.default.logClusterChildren).toHaveBeenCalled()
      expect(clusterDebug.default.logVisiblePinsUpdate).toHaveBeenCalled()
    })

    it('should handle cluster click errors gracefully', async () => {
      const clusterDebug = await import('@/lib/debug/clusterDebug')
      
      // Mock getChildren to throw an error
      const { buildClusterIndex } = await import('@/lib/clustering')
      const mockIndex = {
        getClusters: vi.fn(() => []),
        getChildren: vi.fn(() => { throw new Error('Test error') }),
        getLeaves: vi.fn(),
        getClusterExpansionZoom: vi.fn(() => 15),
        getTile: vi.fn()
      }
      vi.mocked(buildClusterIndex).mockReturnValue(mockIndex as any)

      renderClusterMap()

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      const clusterMarker = screen.getByTestId('marker')
      fireEvent.click(clusterMarker)

      // Verify error logging was called
      expect(clusterDebug.default.logClusterError).toHaveBeenCalledWith(
        expect.any(Error),
        'getting cluster children'
      )
    })
  })

  describe('Visible Pins Updates', () => {
    it('should update visible pins on viewport change', async () => {
      renderClusterMap()

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      // Simulate viewport change
      const viewChangeButton = screen.getByTestId('simulate-view-change')
      fireEvent.click(viewChangeButton)

      // Verify onVisiblePinsChange was called
      await waitFor(() => {
        expect(onVisiblePinsChange).toHaveBeenCalled()
      })
    })

    it('should handle missing onVisiblePinsChange callback', async () => {
      const clusterDebug = await import('@/lib/debug/clusterDebug')
      
      renderClusterMap({ onVisiblePinsChange: undefined })

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      const clusterMarker = screen.getByTestId('marker')
      fireEvent.click(clusterMarker)

      // Verify warning was logged
      expect(clusterDebug.default.warn).toHaveBeenCalledWith(
        'onVisiblePinsChange callback not provided'
      )
    })
  })

  describe('Cluster State Management', () => {
    it('should log cluster state changes', async () => {
      const clusterDebug = await import('@/lib/debug/clusterDebug')
      
      renderClusterMap()

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      // Simulate move end to trigger cluster update
      const moveEndButton = screen.getByTestId('simulate-move-end')
      fireEvent.click(moveEndButton)

      // Verify cluster state logging
      expect(clusterDebug.default.logClusterState).toHaveBeenCalled()
    })

    it('should handle clustering disabled state', async () => {
      const { isClusteringEnabled } = await import('@/lib/clustering')
      vi.mocked(isClusteringEnabled).mockReturnValue(false)

      renderClusterMap()

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      // Verify fallback to individual markers
      expect(screen.getAllByTestId('marker')).toHaveLength(mockMarkers.length)
    })
  })

  describe('Performance Monitoring', () => {
    it('should log cluster performance metrics', async () => {
      const clusterDebug = await import('@/lib/debug/clusterDebug')
      
      renderClusterMap()

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      const clusterMarker = screen.getByTestId('marker')
      fireEvent.click(clusterMarker)

      // Verify performance logging
      expect(clusterDebug.default.logClusterPerformance).toHaveBeenCalledWith(
        'Cluster Click',
        expect.any(Number)
      )
    })
  })

  describe('Debug Flag Integration', () => {
    it('should respect debug flag for logging', async () => {
      // Test with debug disabled
      process.env.NEXT_PUBLIC_DEBUG = 'false'
      
      const clusterDebug = await import('@/lib/debug/clusterDebug')
      
      renderClusterMap()

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      const clusterMarker = screen.getByTestId('marker')
      fireEvent.click(clusterMarker)

      // Verify no debug logging when disabled
      expect(clusterDebug.default.logClusterClick).not.toHaveBeenCalled()
    })

    it('should enable debug logging when flag is true', async () => {
      // Test with debug enabled
      process.env.NEXT_PUBLIC_DEBUG = 'true'
      
      const clusterDebug = await import('@/lib/debug/clusterDebug')
      
      renderClusterMap()

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
      })

      const clusterMarker = screen.getByTestId('marker')
      fireEvent.click(clusterMarker)

      // Verify debug logging when enabled
      expect(clusterDebug.default.logClusterClick).toHaveBeenCalled()
    })
  })
})
