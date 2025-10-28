/**
 * Cluster debugging utilities
 * Controlled by NEXT_PUBLIC_DEBUG environment variable
 */

const isDebugEnabled = () => process.env.NEXT_PUBLIC_DEBUG === 'true'

export const clusterDebug = {
  log: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.log(`[CLUSTER DEBUG] ${message}`, ...args)
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.warn(`[CLUSTER DEBUG] ${message}`, ...args)
    }
  },
  
  error: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.error(`[CLUSTER DEBUG] ${message}`, ...args)
    }
  },
  
  group: (label: string) => {
    if (isDebugEnabled()) {
      console.group(`[CLUSTER DEBUG] ${label}`)
    }
  },
  
  groupEnd: () => {
    if (isDebugEnabled()) {
      console.groupEnd()
    }
  },
  
  time: (label: string) => {
    if (isDebugEnabled()) {
      console.time(`[CLUSTER DEBUG] ${label}`)
    }
  },
  
  timeEnd: (label: string) => {
    if (isDebugEnabled()) {
      console.timeEnd(`[CLUSTER DEBUG] ${label}`)
    }
  },

  // Cluster-specific debugging
  logClusterClick: (cluster: any, details?: any) => {
    if (isDebugEnabled()) {
      console.log(`🖱️ [CLUSTER CLICK] Cluster ${cluster.id} (${cluster.type})`, {
        count: cluster.count,
        lat: cluster.lat,
        lon: cluster.lon,
        ...details
      })
    }
  },

  logClusterChildren: (clusterId: number, children: any[]) => {
    if (isDebugEnabled()) {
      console.log(`👶 [CLUSTER CHILDREN] Cluster ${clusterId} has ${children.length} children:`, 
        children.map(child => ({
          id: child.id,
          type: child.type,
          lat: child.lat,
          lon: child.lon
        }))
      )
    }
  },

  logVisiblePinsUpdate: (visibleIds: string[], count: number, reason: string) => {
    if (isDebugEnabled()) {
      console.log(`👁️ [VISIBLE PINS] ${reason}: ${count} pins`, visibleIds)
    }
  },

  logClusterIndex: (index: any, operation: string) => {
    if (isDebugEnabled()) {
      console.log(`📊 [CLUSTER INDEX] ${operation}:`, {
        hasIndex: !!index,
        type: typeof index,
        methods: index ? Object.getOwnPropertyNames(Object.getPrototypeOf(index)) : []
      })
    }
  },

  logClusterExpansion: (clusterId: number, expansionZoom: number, targetZoom: number) => {
    if (isDebugEnabled()) {
      console.log(`🔍 [CLUSTER EXPANSION] Cluster ${clusterId}:`, {
        expansionZoom,
        targetZoom,
        willExpand: expansionZoom > targetZoom
      })
    }
  },

  logClusterAnimation: (cluster: any, duration: number) => {
    if (isDebugEnabled()) {
      console.log(`🎬 [CLUSTER ANIMATION] Animating to cluster ${cluster.id}:`, {
        center: [cluster.lon, cluster.lat],
        duration: `${duration}ms`
      })
    }
  },

  logClusterState: (clusters: any[], visiblePins: string[], operation: string) => {
    if (isDebugEnabled()) {
      console.log(`📈 [CLUSTER STATE] ${operation}:`, {
        totalClusters: clusters.length,
        visiblePins: visiblePins.length,
        clusterTypes: clusters.reduce((acc, c) => {
          acc[c.type] = (acc[c.type] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      })
    }
  },

  logClusterPerformance: (operation: string, startTime: number) => {
    if (isDebugEnabled()) {
      const duration = Date.now() - startTime
      const status = duration > 1000 ? '🐌 Slow' : duration > 500 ? '⚠️ Medium' : '⚡ Fast'
      console.log(`${status} [CLUSTER PERF] ${operation}: ${duration}ms`)
    }
  },

  logClusterError: (error: Error, context: string) => {
    if (isDebugEnabled()) {
      console.error(`❌ [CLUSTER ERROR] ${context}:`, {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
    }
  },

  // Test helpers for CI
  logTestStart: (testName: string) => {
    if (isDebugEnabled()) {
      console.log(`🧪 [CLUSTER TEST] Starting: ${testName}`)
    }
  },

  logTestResult: (testName: string, passed: boolean, details?: any) => {
    if (isDebugEnabled()) {
      const emoji = passed ? '✅' : '❌'
      console.log(`${emoji} [CLUSTER TEST] ${testName}: ${passed ? 'PASSED' : 'FAILED'}`, details || '')
    }
  }
}

export default clusterDebug
