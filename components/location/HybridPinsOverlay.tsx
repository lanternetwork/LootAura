'use client'

import { useMemo } from 'react'
import { Sale } from '@/lib/types'
import { HybridPinsResult } from '@/lib/pins/types'
import { createHybridPins } from '@/lib/pins/hybridClustering'
import ClusterMarker from './ClusterMarker'
import LocationPin from './LocationPin'

interface HybridPinsOverlayProps {
  sales: Sale[]
  selectedId?: string | null
  onLocationClick?: (locationId: string) => void
  onClusterClick?: (cluster: any) => void
  viewport: { bounds: [number, number, number, number]; zoom: number }
}

export default function HybridPinsOverlay({
  sales,
  selectedId,
  onLocationClick,
  onClusterClick,
  viewport
}: HybridPinsOverlayProps) {
  
  // Create hybrid pins using the two-stage process
  const hybridResult = useMemo((): HybridPinsResult => {
    return createHybridPins(sales, viewport, {
      coordinatePrecision: 6,
      clusterRadius: 0.5,
      minClusterSize: 2,
      maxZoom: 16,
      enableLocationGrouping: true,
      enableVisualClustering: true
    })
  }, [sales, viewport])

  // Early return if no sales
  if (sales.length === 0) {
    return null
  }

  // Debug logging
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[HYBRID_PINS] Result:', {
      type: hybridResult.type,
      pinsCount: hybridResult.pins.length,
      locationsCount: hybridResult.locations.length,
      clustersCount: hybridResult.clusters?.length || 0
    })
  }

  return (
    <>
      {hybridResult.pins.map(pin => {
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
          const location = hybridResult.locations.find(loc => loc.id === pin.id)
          if (!location) return null
          
          return (
            <LocationPin
              key={pin.id}
              location={location}
              isSelected={selectedId === pin.id}
              onClick={onLocationClick}
            />
          )
        }
      })}
    </>
  )
}
