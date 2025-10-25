/**
 * Types for the pins system
 */

export interface PinPoint {
  id: string
  lat: number
  lng: number
}

export interface ClusterFeature {
  id: number
  count: number
  lat: number
  lng: number
  expandToZoom: number
}

export interface ClusterOptions {
  radius: number
  maxZoom: number
  minPoints: number
}

// Hybrid system types
export interface LocationGroup {
  id: string
  lat: number
  lng: number
  sales: any[] // Sale objects
  totalSales: number
}

export interface HybridPin {
  type: 'cluster' | 'location'
  id: string
  lat: number
  lng: number
  count?: number // For clusters
  sales?: any[] // For locations
  expandToZoom?: number // For clusters
}

export interface HybridPinsResult {
  type: 'clustered' | 'individual'
  pins: HybridPin[]
  locations: LocationGroup[]
  clusters?: ClusterFeature[]
}

export interface PinsProps {
  sales: PinPoint[]
  selectedId?: string | null
  onPinClick?: (saleId: string) => void
  onClusterClick?: (cluster: ClusterFeature) => void
}

// Hybrid pins props
export interface HybridPinsProps {
  hybridResult: HybridPinsResult
  selectedId?: string | null
  onLocationClick?: (locationId: string) => void
  onClusterClick?: (cluster: ClusterFeature) => void
}
