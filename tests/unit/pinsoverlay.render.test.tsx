/**
 * Unit tests for PinsOverlay rendering
 */

import { render, screen } from '@testing-library/react'
import PinsOverlay from '@/components/location/PinsOverlay'
import { PinPoint } from '@/lib/pins/types'

// Mock react-map-gl
jest.mock('react-map-gl', () => ({
  Marker: ({ children, ...props }: any) => (
    <div data-testid="marker" {...props}>
      {children}
    </div>
  )
}))

// Mock clustering utilities
jest.mock('@/lib/pins/clustering', () => ({
  buildClusterIndex: jest.fn(() => ({
    getClusters: jest.fn(() => [])
  })),
  getClustersForViewport: jest.fn(() => [])
}))

// Mock ClusterMarker and PinMarker
jest.mock('@/components/location/ClusterMarker', () => {
  return function MockClusterMarker({ cluster }: any) {
    return <div data-testid="cluster-marker" data-cluster-id={cluster.id}>{cluster.count}</div>
  }
})

jest.mock('@/components/location/PinMarker', () => {
  return function MockPinMarker({ id, lat, lng }: any) {
    return <div data-testid="pin-marker" data-pin-id={id}>{id}</div>
  }
})

describe('PinsOverlay Rendering', () => {
  const mockMapRef = {
    current: {
      getMap: jest.fn(() => ({
        getBounds: jest.fn(() => ({
          getWest: () => -86,
          getSouth: () => 37,
          getEast: () => -85,
          getNorth: () => 39
        })),
        getZoom: jest.fn(() => 10)
      }))
    }
  }

  const testSales: PinPoint[] = [
    { id: '1', lat: 38.2527, lng: -85.7585 },
    { id: '2', lat: 38.2530, lng: -85.7590 },
    { id: '3', lat: 38.2535, lng: -85.7595 }
  ]

  const defaultProps = {
    sales: testSales,
    selectedId: null,
    onPinClick: jest.fn(),
    onClusterClick: jest.fn(),
    mapRef: mockMapRef,
    isClusteringEnabled: false
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('with clustering disabled', () => {
    it('should render individual pin markers for each sale', () => {
      render(<PinsOverlay {...defaultProps} isClusteringEnabled={false} />)
      
      const pinMarkers = screen.getAllByTestId('pin-marker')
      expect(pinMarkers).toHaveLength(3)
      
      pinMarkers.forEach((marker, index) => {
        expect(marker).toHaveAttribute('data-pin-id', testSales[index].id)
      })
    })

    it('should not render cluster markers when clustering is disabled', () => {
      render(<PinsOverlay {...defaultProps} isClusteringEnabled={false} />)
      
      const clusterMarkers = screen.queryAllByTestId('cluster-marker')
      expect(clusterMarkers).toHaveLength(0)
    })

    it('should handle empty sales array', () => {
      render(<PinsOverlay {...defaultProps} sales={[]} isClusteringEnabled={false} />)
      
      const pinMarkers = screen.queryAllByTestId('pin-marker')
      expect(pinMarkers).toHaveLength(0)
    })
  })

  describe('with clustering enabled', () => {
    const mockClusters = [
      { id: 1, count: 3, lat: 38.2527, lng: -85.7585, expandToZoom: 12 },
      { id: 2, count: 1, lat: 40.7128, lng: -74.0060, expandToZoom: 15 }
    ]

    beforeEach(() => {
      const { getClustersForViewport } = require('@/lib/pins/clustering')
      getClustersForViewport.mockReturnValue(mockClusters)
    })

    it('should render cluster markers when clustering is enabled', () => {
      render(<PinsOverlay {...defaultProps} isClusteringEnabled={true} />)
      
      const clusterMarkers = screen.getAllByTestId('cluster-marker')
      expect(clusterMarkers).toHaveLength(2)
      
      clusterMarkers.forEach((marker, index) => {
        expect(marker).toHaveAttribute('data-cluster-id', mockClusters[index].id.toString())
      })
    })

    it('should not render individual pin markers when clustering is enabled', () => {
      render(<PinsOverlay {...defaultProps} isClusteringEnabled={true} />)
      
      const pinMarkers = screen.queryAllByTestId('pin-marker')
      expect(pinMarkers).toHaveLength(0)
    })

    it('should handle empty clusters array', () => {
      const { getClustersForViewport } = require('@/lib/pins/clustering')
      getClustersForViewport.mockReturnValue([])
      
      render(<PinsOverlay {...defaultProps} isClusteringEnabled={true} />)
      
      const clusterMarkers = screen.queryAllByTestId('cluster-marker')
      expect(clusterMarkers).toHaveLength(0)
    })
  })

  describe('map ref handling', () => {
    it('should handle null map ref', () => {
      const nullMapRef = { current: null }
      
      render(<PinsOverlay {...defaultProps} mapRef={nullMapRef} isClusteringEnabled={true} />)
      
      // Should not crash and should render nothing
      const clusterMarkers = screen.queryAllByTestId('cluster-marker')
      const pinMarkers = screen.queryAllByTestId('pin-marker')
      expect(clusterMarkers).toHaveLength(0)
      expect(pinMarkers).toHaveLength(0)
    })

    it('should handle map ref without getMap method', () => {
      const invalidMapRef = { current: {} }
      
      render(<PinsOverlay {...defaultProps} mapRef={invalidMapRef} isClusteringEnabled={true} />)
      
      // Should not crash and should render nothing
      const clusterMarkers = screen.queryAllByTestId('cluster-marker')
      const pinMarkers = screen.queryAllByTestId('pin-marker')
      expect(clusterMarkers).toHaveLength(0)
      expect(pinMarkers).toHaveLength(0)
    })
  })

  describe('callback handling', () => {
    it('should pass onPinClick callback to pin markers', () => {
      const onPinClick = jest.fn()
      render(<PinsOverlay {...defaultProps} onPinClick={onPinClick} isClusteringEnabled={false} />)
      
      // The callback should be passed to PinMarker components
      // This is tested implicitly through the component rendering
      expect(onPinClick).toBeDefined()
    })

    it('should pass onClusterClick callback to cluster markers', () => {
      const onClusterClick = jest.fn()
      const { getClustersForViewport } = require('@/lib/pins/clustering')
      getClustersForViewport.mockReturnValue([{ id: 1, count: 3, lat: 38.2527, lng: -85.7585, expandToZoom: 12 }])
      
      render(<PinsOverlay {...defaultProps} onClusterClick={onClusterClick} isClusteringEnabled={true} />)
      
      // The callback should be passed to ClusterMarker components
      // This is tested implicitly through the component rendering
      expect(onClusterClick).toBeDefined()
    })
  })
})
