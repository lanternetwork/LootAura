/**
 * Hybrid clustering system that combines location-based grouping with visual clustering
 */

import { Sale } from '@/lib/types'
import { LocationGroup, HybridPinsResult, HybridPin } from './types'
import { buildClusterIndex, getClustersForViewport, isClusteringEnabled } from './clustering'

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
  clusterRadius: 0.5,
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
        groups.set(key, {
          id: `location-${groups.size}`,
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
  
  // Add clusters
  clusters.forEach(cluster => {
    pins.push({
      type: 'cluster',
      id: `cluster-${cluster.id}`,
      lat: cluster.lat,
      lng: cluster.lng,
      count: cluster.count,
      expandToZoom: cluster.expandToZoom
    })
  })
  
  // Add individual locations that aren't clustered
  const _clusteredLocationIds = new Set<string>()
  
  // For each cluster, we need to determine which locations are included
  // Since we don't have direct access to the cluster's children, we'll use a different approach:
  // Only show individual pins if there are no clusters, or if the zoom level is high enough
  const shouldShowIndividualPins = clusters.length === 0 || viewport.zoom >= opts.maxZoom
  
  // Only add individual locations if we should show them
  if (shouldShowIndividualPins) {
    locations.forEach(location => {
      pins.push({
        type: 'location' as const,
        id: location.id,
        lat: location.lat,
        lng: location.lng,
        sales: location.sales
      })
    })
  }
  
  return {
    type: clusters.length > 0 ? 'clustered' : 'individual',
    pins,
    locations,
    clusters
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
