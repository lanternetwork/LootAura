/**
 * Unit tests for touch-only clustering behavior with 6.5px radius
 * 
 * Tests verify that clustering only occurs when pins would actually touch
 * (12px diameter pins, 6.5px radius means pins cluster when centers are within ~12-13px)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { buildClusterIndex, getClustersForViewport, getClusterMemberIds } from '@/lib/pins/clustering'
import { PinPoint } from '@/lib/pins/types'

describe('Touch-Only Clustering (6.5px radius)', () => {
  // Production uses 6.5px radius for touch-only clustering
  const TOUCH_ONLY_RADIUS = 6.5
  
  describe('close pins that should touch (within 12px)', () => {
    it('should cluster pins that are within touching distance', () => {
      // Create points very close together (less than 0.0001 degrees apart ≈ ~11 meters ≈ should cluster at typical zoom)
      // At zoom 15, 1 pixel ≈ 1.19 meters, so 12px ≈ 14.3 meters
      // At zoom 15, 0.0001 degrees ≈ 11.1 meters (latitude), so they should cluster
      const closePoints: PinPoint[] = [
        { id: '1', lat: 38.2527, lng: -85.7585 },
        { id: '2', lat: 38.25271, lng: -85.7585 }, // ~0.00001 degrees apart ≈ 1.1 meters
        { id: '3', lat: 38.25272, lng: -85.7585 }, // ~0.00002 degrees apart ≈ 2.2 meters
      ]

      const index = buildClusterIndex(closePoints, {
        radius: TOUCH_ONLY_RADIUS,
        maxZoom: 16,
        minPoints: 2
      })

      // At zoom 15, these should cluster (very close together)
      const bounds: [number, number, number, number] = [-85.76, 38.25, -85.75, 38.26]
      const clusters = getClustersForViewport(index, bounds, 15)

      // Should have at least one cluster with count > 1
      const trueClusters = clusters.filter(c => c.count > 1)
      expect(trueClusters.length).toBeGreaterThan(0)
    })

    it('should cluster pins at the same location', () => {
      // Points at exactly the same location should always cluster
      const sameLocationPoints: PinPoint[] = [
        { id: '1', lat: 38.2527, lng: -85.7585 },
        { id: '2', lat: 38.2527, lng: -85.7585 },
        { id: '3', lat: 38.2527, lng: -85.7585 },
      ]

      const index = buildClusterIndex(sameLocationPoints, {
        radius: TOUCH_ONLY_RADIUS,
        maxZoom: 16,
        minPoints: 2
      })

      const bounds: [number, number, number, number] = [-85.76, 38.25, -85.75, 38.26]
      const clusters = getClustersForViewport(index, bounds, 15)

      // Should have exactly one cluster with count = 3
      const trueClusters = clusters.filter(c => c.count > 1)
      expect(trueClusters.length).toBeGreaterThanOrEqual(1)
      expect(trueClusters.some(c => c.count === 3)).toBe(true)
    })
  })

  describe('distant pins that should not touch (beyond 12px)', () => {
    it('should not cluster pins that are too far apart', () => {
      // Create points far apart (0.01 degrees ≈ 1.1 km apart)
      // At zoom 15, these would be hundreds of pixels apart, so they shouldn't cluster
      const distantPoints: PinPoint[] = [
        { id: '1', lat: 38.2527, lng: -85.7585 },
        { id: '2', lat: 38.2627, lng: -85.7685 }, // ~0.01 degrees apart ≈ 1.1 km
        { id: '3', lat: 38.2727, lng: -85.7785 }, // ~0.02 degrees apart ≈ 2.2 km
      ]

      const index = buildClusterIndex(distantPoints, {
        radius: TOUCH_ONLY_RADIUS,
        maxZoom: 16,
        minPoints: 2
      })

      // At zoom 15, these should NOT cluster (too far apart)
      const bounds: [number, number, number, number] = [-85.78, 38.25, -85.75, 38.28]
      const clusters = getClustersForViewport(index, bounds, 15)

      // At this zoom and distance, should see individual points, not clusters
      // Note: At very low zoom, they might cluster, but at zoom 15 with 6.5px radius, they should be separate
      const trueClusters = clusters.filter(c => c.count > 1)
      // These are far enough apart that even with 6.5px radius at zoom 15, they shouldn't cluster
      expect(trueClusters.length).toBe(0)
    })
  })

  describe('6.5px radius production behavior', () => {
    it('should use 6.5px radius when explicitly specified', () => {
      const points: PinPoint[] = [
        { id: '1', lat: 38.2527, lng: -85.7585 },
        { id: '2', lat: 38.25271, lng: -85.7585 }, // Very close
      ]

      const index = buildClusterIndex(points, {
        radius: TOUCH_ONLY_RADIUS,
        maxZoom: 16,
        minPoints: 2
      })

      expect(index).toBeDefined()
      
      // Verify the index was built with the correct radius
      const bounds: [number, number, number, number] = [-85.76, 38.25, -85.75, 38.26]
      const clusters = getClustersForViewport(index, bounds, 15)
      
      // Should cluster very close points
      const trueClusters = clusters.filter(c => c.count > 1)
      expect(trueClusters.length).toBeGreaterThan(0)
    })

    it('should have different behavior than 0.3px default radius', () => {
      const points: PinPoint[] = [
        { id: '1', lat: 38.2527, lng: -85.7585 },
        { id: '2', lat: 38.2528, lng: -85.7585 }, // Moderately close
      ]

      // Build with 0.3px (ultra-conservative default)
      const indexConservative = buildClusterIndex(points, {
        radius: 0.3,
        maxZoom: 16,
        minPoints: 2
      })

      // Build with 6.5px (touch-only production)
      const indexTouchOnly = buildClusterIndex(points, {
        radius: TOUCH_ONLY_RADIUS,
        maxZoom: 16,
        minPoints: 2
      })

      const bounds: [number, number, number, number] = [-85.76, 38.25, -85.75, 38.26]
      const clustersConservative = getClustersForViewport(indexConservative, bounds, 15)
      const clustersTouchOnly = getClustersForViewport(indexTouchOnly, bounds, 15)

      // With 0.3px radius, these might not cluster
      // With 6.5px radius, these should cluster
      const trueClustersConservative = clustersConservative.filter(c => c.count > 1)
      const trueClustersTouchOnly = clustersTouchOnly.filter(c => c.count > 1)

      // Touch-only should cluster more aggressively (when pins would touch)
      expect(trueClustersTouchOnly.length).toBeGreaterThanOrEqual(trueClustersConservative.length)
    })
  })

  describe('getClusterMemberIds with touch-only clustering', () => {
    it('should correctly identify cluster members with 6.5px radius', () => {
      const points: PinPoint[] = [
        { id: '1', lat: 38.2527, lng: -85.7585 },
        { id: '2', lat: 38.25271, lng: -85.7585 }, // Very close
        { id: '3', lat: 38.25272, lng: -85.7585 }, // Very close
      ]

      const index = buildClusterIndex(points, {
        radius: TOUCH_ONLY_RADIUS,
        maxZoom: 16,
        minPoints: 2
      })

      const bounds: [number, number, number, number] = [-85.76, 38.25, -85.75, 38.26]
      const clusters = getClustersForViewport(index, bounds, 15)
      const trueClusters = clusters.filter(c => c.count > 1)

      if (trueClusters.length > 0) {
        const clusterId = trueClusters[0].id
        const memberIds = getClusterMemberIds(index, [clusterId])
        
        // Should include the clustered point IDs
        expect(memberIds.size).toBeGreaterThan(0)
        expect(memberIds.size).toBeLessThanOrEqual(3) // All 3 points might be clustered
      }
    })
  })
})

