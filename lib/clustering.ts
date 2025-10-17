// Client-side clustering engine for map markers
// Uses supercluster for fast, deterministic clustering

import Supercluster from 'supercluster'

export interface ClusterPoint {
  id: string
  lon: number
  lat: number
  category?: string
  [key: string]: any
}

export interface ClusterResult {
  type: 'cluster' | 'point'
  id: string
  count?: number
  lon: number
  lat: number
  children?: ClusterPoint[]
  properties?: Record<string, any>
}

export interface ClusterOptions {
  radius?: number
  maxZoom?: number
  minPoints?: number
  extent?: number
  nodeSize?: number
}

export interface ClusterIndex {
  getClusters(bbox: [number, number, number, number], zoom: number): ClusterResult[]
  getChildren(clusterId: number): ClusterPoint[]
  getLeaves(clusterId: number, limit?: number, offset?: number): ClusterPoint[]
  getClusterExpansionZoom(clusterId: number): number
  getTile(z: number, x: number, y: number): any
}

// Default clustering options optimized for performance
const DEFAULT_OPTIONS: Required<ClusterOptions> = {
  radius: 50, // 50px radius for clustering
  maxZoom: 16, // Don't cluster above zoom 16
  minPoints: 2, // Minimum 2 points to form a cluster
  extent: 512, // Tile extent
  nodeSize: 64 // Node size for tree structure
}

/**
 * Build a cluster index from points
 */
export function buildClusterIndex(
  points: ClusterPoint[],
  options: ClusterOptions = {}
): ClusterIndex {
  const startTime = performance.now()
  
  const config = { ...DEFAULT_OPTIONS, ...options }
  
  const index = new Supercluster({
    radius: config.radius,
    maxZoom: config.maxZoom,
    minPoints: config.minPoints,
    extent: config.extent,
    nodeSize: config.nodeSize
  })
  
  // Load points into the index
  index.load(points.map(point => ({
    type: 'Feature',
    properties: {
      id: point.id,
      category: point.category,
      ...point
    },
    geometry: {
      type: 'Point',
      coordinates: [point.lon, point.lat]
    }
  })))
  
  const buildTime = performance.now() - startTime
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[CLUSTER] Index built', {
      event: 'cluster-build',
      points: points.length,
      clusters: index.getClusters([-180, -90, 180, 90], 0).length,
      ms: Math.round(buildTime)
    })
  }
  
  return index
}

/**
 * Get clusters for a viewport
 */
export function getClustersForViewport(
  index: ClusterIndex,
  bbox: [number, number, number, number],
  zoom: number
): ClusterResult[] {
  const startTime = performance.now()
  
  const clusters = index.getClusters(bbox, Math.floor(zoom))
  
  const results: ClusterResult[] = clusters.map(cluster => {
    if (cluster.properties?.cluster) {
      // This is a cluster
      return {
        type: 'cluster',
        id: `cluster-${cluster.properties.cluster_id}`,
        count: cluster.properties.point_count,
        lon: cluster.geometry.coordinates[0],
        lat: cluster.geometry.coordinates[1],
        properties: cluster.properties
      }
    } else {
      // This is a point
      return {
        type: 'point',
        id: cluster.properties.id,
        lon: cluster.geometry.coordinates[0],
        lat: cluster.geometry.coordinates[1],
        properties: cluster.properties
      }
    }
  })
  
  const viewportTime = performance.now() - startTime
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[CLUSTER] Viewport query', {
      event: 'cluster-viewport',
      returned: results.length,
      ms: Math.round(viewportTime)
    })
  }
  
  return results
}

/**
 * Get cluster expansion zoom level
 */
export function getClusterExpansionZoom(
  index: ClusterIndex,
  clusterId: number
): number {
  return index.getClusterExpansionZoom(clusterId)
}

/**
 * Get children of a cluster
 */
export function getClusterChildren(
  index: ClusterIndex,
  clusterId: number,
  limit?: number,
  offset?: number
): ClusterPoint[] {
  return index.getLeaves(clusterId, limit, offset).map(leaf => ({
    id: leaf.properties.id,
    lon: leaf.geometry.coordinates[0],
    lat: leaf.geometry.coordinates[1],
    category: leaf.properties.category,
    ...leaf.properties
  }))
}

/**
 * Check if clustering is enabled via feature flag
 */
export function isClusteringEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_CLUSTERING !== 'false'
}

/**
 * Get cluster size tier for styling
 */
export function getClusterSizeTier(count: number): 'small' | 'medium' | 'large' {
  if (count < 10) return 'small'
  if (count < 50) return 'medium'
  return 'large'
}

/**
 * Generate accessible label for cluster
 */
export function getClusterLabel(count: number): string {
  return `Cluster of ${count} sales. Press Enter to zoom in.`
}
