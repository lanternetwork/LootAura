'use client'

import { useMemo } from 'react'
import { Sale } from '@/lib/types'
import { HybridPinsResult } from '@/lib/pins/types'
import { createHybridPins } from '@/lib/pins/hybridClustering'
import ClusterMarker from './ClusterMarker'
import LocationPin from './LocationPin'

interface HybridPinsOverlayProps {
  hybridResult: any // Pre-calculated hybrid result
  selectedId?: string | null
  onLocationClick?: (locationId: string) => void
  onClusterClick?: (cluster: any) => void
}

export default function HybridPinsOverlay({
  hybridResult,
  selectedId,
  onLocationClick,
  onClusterClick
}: HybridPinsOverlayProps) {
  // Early return if no hybrid result
  if (!hybridResult || hybridResult.pins.length === 0) {
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
