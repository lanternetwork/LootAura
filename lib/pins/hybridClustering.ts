/**
 * Hybrid clustering system that combines location-based grouping with visual clustering
 */

import { Sale } from '@/lib/types'
import { LocationGroup, HybridPinsResult, HybridPin } from './types'
import { buildClusterIndex, getClustersForViewport, getClusterMemberIds, isClusteringEnabled } from './clustering'

export interface HybridClusteringOptions {
  coordinatePrecision: number
  clusterRadius: number
  minClusterSize: number
  maxZoom: number
  enableLocationGrouping: boolean
  enableVisualClustering: boolean
}

const DEFAULT_OPTIONS: HybridClusteringOptions = {
  coordinatePrecision: 6,
  clusterRadius: 6.5, // px: touch-only default - cluster only when pins actually touch (pins are 12px diameter, 12px apart = edge-to-edge)
  minClusterSize: 2,
  maxZoom: 16,
  enableLocationGrouping: true,
  enableVisualClustering: true
}

/**
 * Group sales by unique coordinates (Stage 1: Location-based grouping)
 */
export function groupSalesByLocation(
  sales: Sale[], 
  options: Partial<HybridClusteringOptions> = {}
): LocationGroup[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  if (!opts.enableLocationGrouping) {
    // Return individual sales as separate locations
    return sales
      .filter(sale => typeof sale.lat === 'number' && typeof sale.lng === 'number')
      .map(sale => ({
        id: sale.id,
        lat: sale.lat!,
        lng: sale.lng!,
        sales: [sale],
        totalSales: 1
      }))
  }
  
  const groups = new Map<string, LocationGroup>()
  
  sales.forEach(sale => {
    if (typeof sale.lat === 'number' && typeof sale.lng === 'number') {
      // Create a key from coordinates with specified precision
      const key = `${sale.lat.toFixed(opts.coordinatePrecision)},${sale.lng.toFixed(opts.coordinatePrecision)}`
      
      if (!groups.has(key)) {
        // Use the coordinate key as the ID to ensure stable IDs across recalculations
        // This prevents location IDs from changing when clustering recalculates
        // Replace comma with underscore to make it safe for use in HTML/CSS
        const stableId = `location-${key.replace(',', '_')}`
        groups.set(key, {
          id: stableId,
          lat: sale.lat,
          lng: sale.lng,
          sales: [],
          totalSales: 0
        })
      }
      
      const group = groups.get(key)!
      group.sales.push(sale)
      group.totalSales = group.sales.length
    }
  })
  
  return Array.from(groups.values())
}

/**
 * Apply visual clustering to location groups (Stage 2: Visual clustering)
 */
export function applyVisualClustering(
  locations: LocationGroup[],
  viewport: { bounds: [number, number, number, number]; zoom: number },
  options: Partial<HybridClusteringOptions> = {}
): HybridPinsResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // If clustering is disabled or not enough locations, return individual locations
  if (!opts.enableVisualClustering || 
      !isClusteringEnabled() || 
      locations.length < opts.minClusterSize) {
    
    const pins: HybridPin[] = locations.map(location => ({
      type: 'location',
      id: location.id,
      lat: location.lat,
      lng: location.lng,
      sales: location.sales
    }))
    
    return {
      type: 'individual',
      pins,
      locations
    }
  }
  
  // Convert locations to pin points for clustering
  const pinPoints = locations.map(location => ({
    id: location.id,
    lat: location.lat,
    lng: location.lng
  }))
  
  // Build cluster index
  const clusterIndex = buildClusterIndex(pinPoints, {
    radius: opts.clusterRadius,
    maxZoom: opts.maxZoom,
    minPoints: opts.minClusterSize
  })
  
  // Get clusters for current viewport
  const clusters = getClustersForViewport(
    clusterIndex,
    viewport.bounds,
    viewport.zoom
  )
  
  // Create hybrid pins
  const pins: HybridPin[] = []

  // Add clusters (defensive: only real clusters with count > 1)
  const realClusters = clusters.filter(c => (c.count || 0) > 1)
  realClusters.forEach(cluster => {
    // Calculate total sales count for this cluster by summing sales from all location groups in the cluster
    let totalSalesCount = 0
    try {
      const leaves = (clusterIndex as any).getLeaves?.(cluster.id, Infinity) || []
      leaves.forEach((leaf: any) => {
        const locationId = leaf?.properties?.id
        if (locationId) {
          const location = locations.find(loc => loc.id === locationId)
          if (location) {
            totalSalesCount += location.totalSales
          }
        }
      })
    } catch {
      // Fallback: if getLeaves fails, use cluster.count as minimum (at least that many locations)
      // Try to get children and sum their sales
      try {
        const children = (clusterIndex as any).getChildren?.(cluster.id) || []
        children.forEach((child: any) => {
          const locationId = child?.properties?.id
          if (locationId) {
            const location = locations.find(loc => loc.id === locationId)
            if (location) {
              totalSalesCount += location.totalSales
            }
          } else {
            // If it's a nested cluster, use its point_count as fallback
            const pointCount = child?.properties?.point_count || 0
            totalSalesCount += pointCount
          }
        })
      } catch {
        // Final fallback: use cluster.count (number of location groups)
        totalSalesCount = cluster.count || 0
      }
    }
    
    // Use total sales count, or fallback to cluster.count if calculation failed
    const finalCount = totalSalesCount > 0 ? totalSalesCount : cluster.count
    
    pins.push({
      type: 'cluster',
      id: `cluster-${cluster.id}`,
      lat: cluster.lat,
      lng: cluster.lng,
      count: finalCount,
      expandToZoom: cluster.expandToZoom
    })
  })
  
  // Add individual locations that aren't clustered at current zoom
  const indexForMembership = buildClusterIndex(
    locations.map(l => ({ id: l.id, lat: l.lat, lng: l.lng })),
    { radius: opts.clusterRadius, maxZoom: opts.maxZoom, minPoints: opts.minClusterSize }
  )
  const clusteredIds = getClusterMemberIds(indexForMembership, realClusters.map(c => c.id))
  let colocatedClusterCount = 0
  locations.forEach(location => {
    if (clusteredIds.has(location.id)) {
      return
    }
    if (location.totalSales >= 2) {
      // Treat multiple sales at the exact same location as a cluster badge
      pins.push({
        type: 'cluster' as const,
        id: `cluster-coloc-${location.id}`,
        lat: location.lat,
        lng: location.lng,
        count: location.totalSales,
        expandToZoom: opts.maxZoom
      })
      colocatedClusterCount += 1
      return
    }
    pins.push({
      type: 'location' as const,
      id: location.id,
      lat: location.lat,
      lng: location.lng,
      sales: location.sales
    })
  })
  
  return {
    type: (realClusters.length + colocatedClusterCount) > 0 ? 'clustered' : 'individual',
    pins,
    locations,
    clusters: realClusters
  }
}

/**
 * Main hybrid clustering function
 */
export function createHybridPins(
  sales: Sale[],
  viewport: { bounds: [number, number, number, number]; zoom: number },
  options: Partial<HybridClusteringOptions> = {}
): HybridPinsResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // Stage 1: Group sales by location
  const locations = groupSalesByLocation(sales, opts)
  
  // Stage 2: Apply visual clustering
  return applyVisualClustering(locations, viewport, opts)
}

/**
 * Get sales for a specific location
 */
export function getSalesForLocation(
  locationId: string,
  locations: LocationGroup[]
): Sale[] {
  const location = locations.find(loc => loc.id === locationId)
  return location ? location.sales : []
}

/**
 * Get all sales from a cluster (requires cluster expansion)
 */
export function getSalesFromCluster(
  clusterId: string,
  locations: LocationGroup[]
): Sale[] {
  // This would need to be implemented to get the actual locations in a cluster
  // For now, return all sales
  return locations.flatMap(location => location.sales)
}
