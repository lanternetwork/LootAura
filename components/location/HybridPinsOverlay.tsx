'use client'

import { useMemo } from 'react'
import { Sale } from '@/lib/types'
import { HybridPinsResult, HybridPin, LocationGroup } from '@/lib/pins/types'
import { createHybridPins } from '@/lib/pins/hybridClustering'
import ClusterMarker from './ClusterMarker'
import LocationPin from './LocationPin'

interface HybridPinsOverlayProps {
  sales: Sale[]
  selectedId?: string | null
  onLocationClick?: (locationId: string) => void
  onLocationClickWithCoords?: (locationId: string, lat: number, lng: number) => void
  onClusterClick?: (cluster: any) => void
  mapRef: React.RefObject<any>
  viewport: { bounds: [number, number, number, number]; zoom: number }
  // Optional pre-calculated hybridResult to avoid duplicate clustering
  hybridResult?: HybridPinsResult | null
}

export default function HybridPinsOverlay({
  sales,
  selectedId,
  onLocationClick,
  onLocationClickWithCoords,
  onClusterClick,
  mapRef: _mapRef,
  viewport,
  hybridResult: providedHybridResult
}: HybridPinsOverlayProps) {
  
  // Calculate fallback result (only when not provided) - must be called unconditionally
  const fallbackResult = useMemo(() => {
    return createHybridPins(sales, viewport, {
      coordinatePrecision: 6,
      clusterRadius: 6.5, // px: touch-only - cluster only when pins actually touch (12px apart = edge-to-edge)
      minClusterSize: 2,
      maxZoom: 16,
      enableLocationGrouping: true,
      enableVisualClustering: true
    })
  }, [sales, viewport])
  
  // Use provided hybridResult if available, otherwise use fallback
  // Wrap in useMemo to ensure React detects changes when providedHybridResult changes from null to a value
  const hybridResult = useMemo(() => {
    return providedHybridResult !== null && providedHybridResult !== undefined
      ? providedHybridResult
      : fallbackResult
  }, [providedHybridResult, fallbackResult])

  // Early return if no sales - avoid unnecessary rendering
  if (sales.length === 0) {
    return null
  }

  // Debug logging (only when debug is enabled and there are results)
  if (process.env.NEXT_PUBLIC_DEBUG === 'true' && hybridResult.pins.length > 0) {
    console.log('[HYBRID_PINS] Result:', {
      type: hybridResult.type,
      pinsCount: hybridResult.pins.length,
      locationsCount: hybridResult.locations.length,
      clustersCount: hybridResult.clusters?.length || 0
    })
  }

  // Ensure pins render by checking if hybridResult has pins
  if (!hybridResult || hybridResult.pins.length === 0) {
    return null
  }
  
  return (
    <>
      {hybridResult.pins.map((pin: HybridPin) => {
        if (pin.type === 'cluster') {
          return (
            <ClusterMarker
              key={pin.id}
              cluster={{
                id: parseInt(pin.id.replace('cluster-', '')),
                count: pin.count || 0,
                lat: pin.lat,
                lng: pin.lng,
                expandToZoom: pin.expandToZoom || 16
              }}
              onClick={onClusterClick}
            />
          )
        } else {
          // Find the location data for this pin
          const location = hybridResult.locations.find((loc: LocationGroup) => loc.id === pin.id)
          if (!location) return null
          
          return (
            <LocationPin
              key={pin.id}
              location={location}
              isSelected={selectedId === pin.id}
              onClick={() => (onLocationClickWithCoords ? onLocationClickWithCoords(location.id, location.lat, location.lng) : onLocationClick?.(location.id))}
            />
          )
        }
      })}
    </>
  )
}
