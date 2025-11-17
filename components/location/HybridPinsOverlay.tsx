'use client'

import { useMemo, useRef } from 'react'
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
}

export default function HybridPinsOverlay({
  sales,
  selectedId,
  onLocationClick,
  onLocationClickWithCoords,
  onClusterClick,
  mapRef: _mapRef,
  viewport
}: HybridPinsOverlayProps) {
  
  // Stabilize viewport to prevent unnecessary recalculations
  // Only recalculate if bounds or zoom actually change (not just object reference)
  const prevViewportRef = useRef<{ bounds: [number, number, number, number]; zoom: number } | null>(null)
  const stableViewport = useMemo(() => {
    if (!prevViewportRef.current) {
      prevViewportRef.current = viewport
      return viewport
    }
    
    const prev = prevViewportRef.current
    const boundsChanged = 
      prev.bounds[0] !== viewport.bounds[0] ||
      prev.bounds[1] !== viewport.bounds[1] ||
      prev.bounds[2] !== viewport.bounds[2] ||
      prev.bounds[3] !== viewport.bounds[3]
    const zoomChanged = Math.abs(prev.zoom - viewport.zoom) > 0.01
    
    if (boundsChanged || zoomChanged) {
      prevViewportRef.current = viewport
      return viewport
    }
    
    return prevViewportRef.current
  }, [viewport])
  
  // Create hybrid pins using the two-stage process - touch-only clustering
  // Pins are 12px diameter (6px radius), so cluster only when centers are within 12px (pins exactly touch)
  // Use stable viewport and memoize based on sales array length and IDs to prevent excessive recalculations
  const salesKey = useMemo(() => {
    return sales.map(s => s.id).sort().join(',')
  }, [sales])
  
  const hybridResult = useMemo((): HybridPinsResult => {
    return createHybridPins(sales, stableViewport, {
      coordinatePrecision: 6,
      clusterRadius: 6.5, // px: touch-only - cluster only when pins actually touch (12px apart = edge-to-edge)
      minClusterSize: 2,
      maxZoom: 16,
      enableLocationGrouping: true,
      enableVisualClustering: true
    })
  }, [sales, salesKey, stableViewport])

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
