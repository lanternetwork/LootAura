'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
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
  
  // Debounce viewport updates to prevent cluster flashing during map movement
  // Only update clustering viewport when map movement has stopped or zoom changed significantly
  const [stableViewport, setStableViewport] = useState(viewport)
  const viewportTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastZoomRef = useRef<number>(viewport.zoom)
  const lastBoundsRef = useRef<[number, number, number, number]>(viewport.bounds)
  
  useEffect(() => {
    // Compare actual values, not object reference
    const zoomDiff = Math.abs(viewport.zoom - lastZoomRef.current)
    const boundsChanged = viewport.bounds.some((val, i) => Math.abs(val - lastBoundsRef.current[i]) > 0.0001)
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[HYBRID_PINS] Viewport update:', {
        zoomDiff,
        boundsChanged,
        currentZoom: viewport.zoom,
        lastZoom: lastZoomRef.current,
        stableZoom: stableViewport.zoom
      })
    }
    
    // Clear any pending timeout
    if (viewportTimeoutRef.current) {
      clearTimeout(viewportTimeoutRef.current)
    }
    
    // If zoom changed significantly (more than 0.5 levels), update immediately
    if (zoomDiff > 0.5) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[HYBRID_PINS] Zoom change significant, updating immediately')
      }
      setStableViewport(viewport)
      lastZoomRef.current = viewport.zoom
      lastBoundsRef.current = viewport.bounds
      return
    }
    
    // If bounds haven't changed meaningfully, don't update at all
    if (!boundsChanged && zoomDiff < 0.01) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[HYBRID_PINS] No meaningful change, skipping update')
      }
      return
    }
    
    // Otherwise, debounce viewport updates (wait 300ms after last movement)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[HYBRID_PINS] Debouncing viewport update')
    }
    viewportTimeoutRef.current = setTimeout(() => {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[HYBRID_PINS] Applying debounced viewport update')
      }
      setStableViewport(viewport)
      lastZoomRef.current = viewport.zoom
      lastBoundsRef.current = viewport.bounds
    }, 300)
    
    return () => {
      if (viewportTimeoutRef.current) {
        clearTimeout(viewportTimeoutRef.current)
      }
    }
  }, [viewport, stableViewport])
  
  // Create hybrid pins using the two-stage process - touch-only clustering
  // Pins are 12px diameter (6px radius), so cluster only when centers are within 12px (pins exactly touch)
  // Use stableViewport instead of viewport to prevent constant recalculation during dragging
  const hybridResult = useMemo((): HybridPinsResult => {
    return createHybridPins(sales, stableViewport, {
      coordinatePrecision: 6,
      clusterRadius: 6.5, // px: touch-only - cluster only when pins actually touch (12px apart = edge-to-edge)
      minClusterSize: 2,
      maxZoom: 16,
      enableLocationGrouping: true,
      enableVisualClustering: true
    })
  }, [sales, stableViewport])

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
