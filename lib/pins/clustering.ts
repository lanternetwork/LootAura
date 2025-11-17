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
  const features = index.getClusters(bounds, Math.floor(zoom))
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
  const collectLeaves = (clusterId: number) => {
    try {
      // Try to get leaves directly
      const leaves = (index as any).getLeaves?.(clusterId, Infinity) || []
      leaves.forEach((leaf: any) => {
        // Check if this is a nested cluster or a leaf point
        const pointCount = leaf?.properties?.point_count
        if (pointCount && pointCount > 0) {
          // This is a nested cluster, recurse into it
          if (typeof leaf.id === 'number') {
            collectLeaves(leaf.id)
          }
        } else {
          // This is a leaf point
          const id = leaf?.properties?.id
          if (id) {
            memberIds.add(String(id))
          }
        }
      })
    } catch {
      // Fallback: traverse children when getLeaves is not available or fails
      try {
        const children = (index as any).getChildren?.(clusterId) || []
        children.forEach((child: any) => {
          const pointCount = child?.properties?.point_count
          if (pointCount && pointCount > 0) {
            // This is a nested cluster, recurse into it
            if (typeof child.id === 'number') {
              collectLeaves(child.id)
            }
          } else {
            // This is a leaf point
            const id = child?.properties?.id
            if (id) {
              memberIds.add(String(id))
            }
          }
        })
      } catch {
        // If both methods fail, skip this cluster
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[CLUSTERING] Failed to get members for cluster:', clusterId)
        }
      }
    }
  }
  
  // Process all provided cluster IDs
  clusterIds.forEach((clusterId) => {
    collectLeaves(clusterId)
  })
  
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
