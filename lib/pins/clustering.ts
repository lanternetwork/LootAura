/**
 * Clustering utilities for pins system
 */

import Supercluster from 'supercluster'
import { PinPoint, ClusterFeature, ClusterOptions } from './types'

// Re-export types for backward compatibility
export type { PinPoint, ClusterFeature }
export type ClusterPoint = PinPoint

const DEFAULT_OPTIONS: ClusterOptions = {
  radius: 0.3, // Ultra-conservative clustering radius (0.3px)
  maxZoom: 20,
  minPoints: 2
}

export type SuperclusterIndex = Supercluster<PinPoint, { point_count: number }>

/**
 * Build a Supercluster index from sales data
 */
export function buildClusterIndex(
  sales: PinPoint[], 
  options: Partial<ClusterOptions> = {}
): SuperclusterIndex {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  const cluster = new Supercluster<PinPoint, { point_count: number }>({
    radius: opts.radius,
    maxZoom: opts.maxZoom,
    minPoints: opts.minPoints
  })

  // Convert sales to GeoJSON features
  const features = sales.map(sale => ({
    type: 'Feature' as const,
    properties: sale,
    geometry: {
      type: 'Point' as const,
      coordinates: [sale.lng, sale.lat]
    }
  }))

  cluster.load(features)
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PINS] index built', { 
      points: sales.length, 
      radius: opts.radius, 
      minPoints: opts.minPoints 
    })
  }
  
  return cluster
}

/**
 * Get clusters for a viewport
 */
export function getClustersForViewport(
  index: SuperclusterIndex,
  bounds: [number, number, number, number], // [west, south, east, north]
  zoom: number
): ClusterFeature[] {
  // Use Math.round instead of Math.floor to get more consistent clustering
  // This ensures that zoom levels like 12.4 and 12.6 both round to 12, not floor to different values
  const clusterZoom = Math.round(zoom)
  const features = index.getClusters(bounds, clusterZoom)
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[CLUSTERING] getClustersForViewport:', {
      zoom,
      clusterZoom,
      bounds,
      featuresCount: features.length,
      clusters: features.filter(f => (f.properties as any)?.point_count > 1).map(f => ({
        id: f.id,
        count: (f.properties as any)?.point_count,
        isCluster: typeof f.id === 'number' && f.id < 0
      }))
    })
  }
  
  return features.map(feature => ({
    id: (feature.id as number) ?? -1,
    count: (feature.properties as any)?.point_count || 1,
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
    expandToZoom: expandZoomForCluster(index, feature.id as number, zoom)
  }))
}

/**
 * Get the set of leaf point ids that belong to the provided clusters
 * Recursively traverses nested clusters to find all leaf points
 */
export function getClusterMemberIds(
  index: SuperclusterIndex,
  clusterIds: number[]
): Set<string> {
  const memberIds = new Set<string>()
  
  // Recursively collect all leaf point IDs from clusters
  const collectLeaves = (clusterId: number, depth: number = 0): number => {
    if (depth > 10) {
      // Prevent infinite recursion
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[CLUSTERING] Max depth reached for cluster:', clusterId)
      }
      return 0
    }
    
    let collectedCount = 0
    
    try {
      // Try to get leaves directly - use a large limit to get all leaves
      const leaves = (index as any).getLeaves?.(clusterId, Infinity) || []
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true' && depth === 0) {
        console.log('[CLUSTERING] getClusterMemberIds for cluster:', clusterId, {
          leavesCount: leaves.length,
          firstLeaf: leaves[0] ? {
            id: leaves[0].id,
            hasPointCount: !!(leaves[0]?.properties?.point_count),
            pointCount: leaves[0]?.properties?.point_count,
            hasId: !!leaves[0]?.properties?.id,
            locationId: leaves[0]?.properties?.id
          } : null
        })
      }
      
      leaves.forEach((leaf: any) => {
        // Check if this is a nested cluster or a leaf point
        const pointCount = leaf?.properties?.point_count
        if (pointCount && pointCount > 0 && typeof leaf.id === 'number') {
          // This is a nested cluster, recurse into it
          collectedCount += collectLeaves(leaf.id, depth + 1)
        } else {
          // This is a leaf point
          const id = leaf?.properties?.id
          if (id) {
            memberIds.add(String(id))
            collectedCount += 1
          } else if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.warn('[CLUSTERING] Leaf point missing ID:', leaf)
          }
        }
      })
    } catch (error) {
      // Fallback: traverse children when getLeaves is not available or fails
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[CLUSTERING] getLeaves failed for cluster:', clusterId, error)
      }
      
      try {
        const children = (index as any).getChildren?.(clusterId) || []
        children.forEach((child: any) => {
          const pointCount = child?.properties?.point_count
          if (pointCount && pointCount > 0 && typeof child.id === 'number') {
            // This is a nested cluster, recurse into it
            collectedCount += collectLeaves(child.id, depth + 1)
          } else {
            // This is a leaf point
            const id = child?.properties?.id
            if (id) {
              memberIds.add(String(id))
              collectedCount += 1
            }
          }
        })
      } catch (childError) {
        // If both methods fail, skip this cluster
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[CLUSTERING] Failed to get members for cluster:', clusterId, childError)
        }
      }
    }
    
    return collectedCount
  }
  
  // Process all provided cluster IDs
  clusterIds.forEach((clusterId) => {
    const count = collectLeaves(clusterId)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[CLUSTERING] Collected', count, 'members from cluster', clusterId)
    }
  })
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true' && clusterIds.length > 0) {
    console.log('[CLUSTERING] Total member IDs collected:', {
      clusterIds,
      memberIds: Array.from(memberIds),
      memberCount: memberIds.size
    })
  }
  
  return memberIds
}

/**
 * Calculate the zoom level needed to expand a cluster
 */
export function expandZoomForCluster(
  index: SuperclusterIndex,
  clusterId: number,
  _currentZoom: number
): number {
  const expansionZoom = index.getClusterExpansionZoom(clusterId)
  return Math.min(expansionZoom, 16) // Cap at zoom 16
}

/**
 * Check if clustering is enabled via feature flag
 */
export function isClusteringEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_CLUSTERING !== 'false'
}

/**
 * Get cluster size tier based on count
 */
export function getClusterSizeTier(count: number): 'small' | 'medium' | 'large' {
  if (count < 10) return 'small'
  if (count < 50) return 'medium'
  return 'large'
}

/**
 * Generate accessible cluster label
 */
export function getClusterLabel(count: number): string {
  return `Cluster of ${count} sales. Press Enter to zoom in.`
}
