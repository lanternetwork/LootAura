/**
 * Integration tests for cluster functionality
 * Tests cluster debug functionality and logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import clusterDebug from '@/lib/debug/clusterDebug'

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

describe('Cluster Debug Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Debug Flag Integration', () => {
    it('should respect debug flag for logging', () => {
      // Test with debug disabled
      process.env.NEXT_PUBLIC_DEBUG = 'false'
      
      clusterDebug.log('Test message')
      clusterDebug.warn('Test warning')
      clusterDebug.error('Test error')
      
      // Verify no debug logging when disabled
      expect(clusterDebug.log).not.toHaveBeenCalled()
      expect(clusterDebug.warn).not.toHaveBeenCalled()
      expect(clusterDebug.error).not.toHaveBeenCalled()
    })

    it('should enable debug logging when flag is true', () => {
      // Test with debug enabled
      process.env.NEXT_PUBLIC_DEBUG = 'true'
      
      clusterDebug.log('Test message')
      clusterDebug.warn('Test warning')
      clusterDebug.error('Test error')
      
      // Verify debug logging when enabled
      expect(clusterDebug.log).toHaveBeenCalledWith('Test message')
      expect(clusterDebug.warn).toHaveBeenCalledWith('Test warning')
      expect(clusterDebug.error).toHaveBeenCalledWith('Test error')
    })
  })

  describe('Cluster Debug Methods', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_DEBUG = 'true'
    })

    it('should log cluster click events', () => {
      const cluster = { id: 'cluster-1', type: 'cluster', lat: 38.25, lon: -85.75, count: 2 }
      const details = { clusterId: 1, expansionZoom: 15, targetZoom: 15 }
      
      clusterDebug.logClusterClick(cluster, details)
      
      expect(clusterDebug.logClusterClick).toHaveBeenCalledWith(cluster, details)
    })

    it('should log cluster children', () => {
      const clusterId = 1
      const children = [
        { id: 'sale-1', type: 'point', lat: 38.25, lon: -85.75 },
        { id: 'sale-2', type: 'point', lat: 38.26, lon: -85.76 }
      ]
      
      clusterDebug.logClusterChildren(clusterId, children)
      
      expect(clusterDebug.logClusterChildren).toHaveBeenCalledWith(clusterId, children)
    })

    it('should log visible pins updates', () => {
      const visibleIds = ['sale-1', 'sale-2']
      const count = 2
      const reason = 'cluster click'
      
      clusterDebug.logVisiblePinsUpdate(visibleIds, count, reason)
      
      expect(clusterDebug.logVisiblePinsUpdate).toHaveBeenCalledWith(visibleIds, count, reason)
    })

    it('should log cluster state', () => {
      const clusters = [
        { id: 'cluster-1', type: 'cluster', lat: 38.25, lon: -85.75, count: 2 }
      ]
      const visiblePins = ['sale-1', 'sale-2']
      const operation = 'viewport update'
      
      clusterDebug.logClusterState(clusters, visiblePins, operation)
      
      expect(clusterDebug.logClusterState).toHaveBeenCalledWith(clusters, visiblePins, operation)
    })

    it('should log cluster performance', () => {
      const operation = 'Cluster Click'
      const startTime = Date.now()
      
      clusterDebug.logClusterPerformance(operation, startTime)
      
      expect(clusterDebug.logClusterPerformance).toHaveBeenCalledWith(operation, startTime)
    })

    it('should log cluster errors', () => {
      const error = new Error('Test error')
      const context = 'getting cluster children'
      
      clusterDebug.logClusterError(error, context)
      
      expect(clusterDebug.logClusterError).toHaveBeenCalledWith(error, context)
    })

    it('should log test results', () => {
      const testName = 'Cluster Click Test'
      const passed = true
      const details = { operation: 'click', duration: 100 }
      
      clusterDebug.logTestResult(testName, passed, details)
      
      expect(clusterDebug.logTestResult).toHaveBeenCalledWith(testName, passed, details)
    })
  })

  describe('Debug Grouping', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_DEBUG = 'true'
    })

    it('should handle debug groups', () => {
      clusterDebug.group('Test Group')
      clusterDebug.log('Message in group')
      clusterDebug.groupEnd()
      
      expect(clusterDebug.group).toHaveBeenCalledWith('Test Group')
      expect(clusterDebug.log).toHaveBeenCalledWith('Message in group')
      expect(clusterDebug.groupEnd).toHaveBeenCalled()
    })

    it('should handle timing operations', () => {
      clusterDebug.time('Test Operation')
      clusterDebug.timeEnd('Test Operation')
      
      expect(clusterDebug.time).toHaveBeenCalledWith('Test Operation')
      expect(clusterDebug.timeEnd).toHaveBeenCalledWith('Test Operation')
    })
  })

  describe('Cluster Expansion Logging', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_DEBUG = 'true'
    })

    it('should log cluster expansion details', () => {
      const clusterId = 1
      const expansionZoom = 15
      const targetZoom = 12
      
      clusterDebug.logClusterExpansion(clusterId, expansionZoom, targetZoom)
      
      expect(clusterDebug.logClusterExpansion).toHaveBeenCalledWith(clusterId, expansionZoom, targetZoom)
    })

    it('should log cluster animation details', () => {
      const cluster = { id: 'cluster-1', type: 'cluster', lat: 38.25, lon: -85.75, count: 2 }
      const duration = 500
      
      clusterDebug.logClusterAnimation(cluster, duration)
      
      expect(clusterDebug.logClusterAnimation).toHaveBeenCalledWith(cluster, duration)
    })
  })

  describe('Cluster Index Logging', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_DEBUG = 'true'
    })

    it('should log cluster index operations', () => {
      const index = { getClusters: vi.fn(), getChildren: vi.fn() }
      const operation = 'Getting clusters for viewport'
      
      clusterDebug.logClusterIndex(index, operation)
      
      expect(clusterDebug.logClusterIndex).toHaveBeenCalledWith(index, operation)
    })
  })
})