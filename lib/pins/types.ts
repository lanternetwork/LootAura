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

export interface PinsProps {
  sales: PinPoint[]
  selectedId?: string | null
  onPinClick?: (saleId: string) => void
  onClusterClick?: (cluster: ClusterFeature) => void
}
