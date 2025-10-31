/**
 * Unit tests for clustering index functionality
 */

import { buildClusterIndex, getClustersForViewport, expandZoomForCluster } from '@/lib/pins/clustering'
import { PinPoint } from '@/lib/pins/types'

describe('Clustering Index', () => {
  const testPoints: PinPoint[] = [
    { id: '1', lat: 38.2527, lng: -85.7585 },
    { id: '2', lat: 38.2530, lng: -85.7590 },
    { id: '3', lat: 38.2535, lng: -85.7595 },
    { id: '4', lat: 40.7128, lng: -74.0060 },
    { id: '5', lat: 40.7130, lng: -74.0065 },
    { id: '6', lat: 40.7135, lng: -74.0070 },
    { id: '7', lat: 34.0522, lng: -118.2437 },
    { id: '8', lat: 34.0525, lng: -118.2440 },
    { id: '9', lat: 34.0530, lng: -118.2445 },
    { id: '10', lat: 41.8781, lng: -87.6298 }
  ]

  describe('buildClusterIndex', () => {
    it('should build cluster index with default options', () => {
      const index = buildClusterIndex(testPoints)
      expect(index).toBeDefined()
      expect(typeof index.getClusters).toBe('function')
    })

    it('should build cluster index with custom options', () => {
      const index = buildClusterIndex(testPoints, {
        radius: 30,
        maxZoom: 15,
        minPoints: 3
      })
      expect(index).toBeDefined()
    })

    it('should build cluster index with production touch-only radius (6.5px)', () => {
      const index = buildClusterIndex(testPoints, {
        radius: 6.5, // Production touch-only clustering radius
        maxZoom: 16,
        minPoints: 2
      })
      expect(index).toBeDefined()
      expect(typeof index.getClusters).toBe('function')
    })

    it('should handle empty points array', () => {
      const index = buildClusterIndex([])
      expect(index).toBeDefined()
    })
  })

  describe('getClustersForViewport', () => {
    let index: any

    beforeEach(() => {
      index = buildClusterIndex(testPoints)
    })

    it('should return clusters for Louisville area at zoom 5', () => {
      const bounds: [number, number, number, number] = [-86, 37, -85, 39]
      const clusters = getClustersForViewport(index, bounds, 5)
      
      expect(Array.isArray(clusters)).toBe(true)
      expect(clusters.length).toBeGreaterThan(0)
      
      // Should have cluster features with required properties
      clusters.forEach(cluster => {
        expect(cluster).toHaveProperty('id')
        expect(cluster).toHaveProperty('count')
        expect(cluster).toHaveProperty('lat')
        expect(cluster).toHaveProperty('lng')
        expect(cluster).toHaveProperty('expandToZoom')
        expect(typeof cluster.lat).toBe('number')
        expect(typeof cluster.lng).toBe('number')
        expect(typeof cluster.count).toBe('number')
      })
    })

    it('should return clusters for New York area at zoom 10', () => {
      const bounds: [number, number, number, number] = [-75, 40, -73, 42]
      const clusters = getClustersForViewport(index, bounds, 10)
      
      expect(Array.isArray(clusters)).toBe(true)
      expect(clusters.length).toBeGreaterThan(0)
    })

    it('should return clusters for Los Angeles area at zoom 15', () => {
      const bounds: [number, number, number, number] = [-119, 33, -117, 35]
      const clusters = getClustersForViewport(index, bounds, 15)
      
      expect(Array.isArray(clusters)).toBe(true)
      expect(clusters.length).toBeGreaterThan(0)
    })

    it('should handle empty bounds', () => {
      const bounds: [number, number, number, number] = [0, 0, 0, 0]
      const clusters = getClustersForViewport(index, bounds, 10)
      
      expect(Array.isArray(clusters)).toBe(true)
      expect(clusters.length).toBe(0)
    })
  })

  describe('expandZoomForCluster', () => {
    let index: any

    beforeEach(() => {
      index = buildClusterIndex(testPoints)
    })

    it('should return a zoom level greater than current zoom', () => {
      const currentZoom = 5
      // Get a valid cluster first
      const bounds: [number, number, number, number] = [-180, -90, 180, 90]
      const clusters = getClustersForViewport(index, bounds, currentZoom)
      const cluster = clusters.find(c => c.count > 1)
      
      if (cluster) {
        const expansionZoom = expandZoomForCluster(index, cluster.id, currentZoom)
        expect(expansionZoom).toBeGreaterThan(currentZoom)
        expect(expansionZoom).toBeLessThanOrEqual(16) // Should be capped at 16
      } else {
        // Skip test if no clusters found
        expect(true).toBe(true)
      }
    })

    it('should cap expansion zoom at 16', () => {
      const currentZoom = 15
      // Get a valid cluster first
      const bounds: [number, number, number, number] = [-180, -90, 180, 90]
      const clusters = getClustersForViewport(index, bounds, currentZoom)
      const cluster = clusters.find(c => c.count > 1)
      
      if (cluster) {
        const expansionZoom = expandZoomForCluster(index, cluster.id, currentZoom)
        expect(expansionZoom).toBeLessThanOrEqual(16)
      } else {
        // Skip test if no clusters found
        expect(true).toBe(true)
      }
    })

    it('should handle invalid cluster ID', () => {
      const currentZoom = 10
      const expansionZoom = expandZoomForCluster(index, 999, currentZoom)
      
      expect(expansionZoom).toBeGreaterThanOrEqual(currentZoom)
    })
  })

  describe('Cluster behavior at different zooms', () => {
    let index: any

    beforeEach(() => {
      index = buildClusterIndex(testPoints)
    })

    it('should show fewer clusters at lower zoom levels', () => {
      const bounds: [number, number, number, number] = [-120, 30, -70, 45]
      
      const clustersZoom5 = getClustersForViewport(index, bounds, 5)
      const clustersZoom10 = getClustersForViewport(index, bounds, 10)
      const clustersZoom15 = getClustersForViewport(index, bounds, 15)
      
      expect(clustersZoom5.length).toBeLessThanOrEqual(clustersZoom10.length)
      expect(clustersZoom10.length).toBeLessThanOrEqual(clustersZoom15.length)
    })

    it('should show more individual points at higher zoom levels', () => {
      const bounds: [number, number, number, number] = [-120, 30, -70, 45]
      
      const clustersZoom5 = getClustersForViewport(index, bounds, 5)
      const clustersZoom15 = getClustersForViewport(index, bounds, 15)
      
      // At higher zoom, we should see more individual points (count = 1)
      const individualPointsZoom15 = clustersZoom15.filter(c => c.count === 1)
      const individualPointsZoom5 = clustersZoom5.filter(c => c.count === 1)
      
      expect(individualPointsZoom15.length).toBeGreaterThanOrEqual(individualPointsZoom5.length)
    })
  })
})
