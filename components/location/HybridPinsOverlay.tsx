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
  
  // Stabilize sales array to prevent cluster flashing when visibleSales changes during map movement
  // Only update when the set of sales IDs has meaningfully changed
  const [stableSales, setStableSales] = useState(sales)
  const salesTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSalesIdsRef = useRef<string>(JSON.stringify(sales.map(s => s.id).sort()))
  
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
  
  // Stabilize sales array to prevent cluster flashing when visibleSales changes during map movement
  // Debounce all sales updates to prevent constant recalculation during dragging
  useEffect(() => {
    const currentSalesIds = JSON.stringify(sales.map(s => s.id).sort())
    
    // If the set of sales IDs hasn't changed, don't update
    if (currentSalesIds === lastSalesIdsRef.current) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[HYBRID_PINS] Sales IDs unchanged, skipping update')
      }
      return
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const currentIds = new Set(sales.map(s => s.id))
      const lastIds = new Set(JSON.parse(lastSalesIdsRef.current || '[]'))
      const addedIds = [...currentIds].filter(id => !lastIds.has(id))
      const removedIds = [...lastIds].filter(id => !currentIds.has(id))
      console.log('[HYBRID_PINS] Sales IDs changed:', {
        added: addedIds.length,
        removed: removedIds.length,
        currentCount: sales.length,
        lastCount: lastIds.size
      })
    }
    
    // Clear any pending timeout
    if (salesTimeoutRef.current) {
      clearTimeout(salesTimeoutRef.current)
    }
    
    // Debounce sales updates (wait 400ms after last change) to prevent cluster flashing during map movement
    // This is longer than viewport debounce (300ms) to ensure clusters stabilize
    salesTimeoutRef.current = setTimeout(() => {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[HYBRID_PINS] Applying debounced sales update')
      }
      setStableSales(sales)
      lastSalesIdsRef.current = currentSalesIds
    }, 400)
    
    return () => {
      if (salesTimeoutRef.current) {
        clearTimeout(salesTimeoutRef.current)
      }
    }
  }, [sales])
  
  // Create hybrid pins using the two-stage process - touch-only clustering
  // Pins are 12px diameter (6px radius), so cluster only when centers are within 12px (pins exactly touch)
  // Use stableViewport and stableSales instead of viewport and sales to prevent constant recalculation during dragging
  const hybridResult = useMemo((): HybridPinsResult => {
    return createHybridPins(stableSales, stableViewport, {
      coordinatePrecision: 6,
      clusterRadius: 6.5, // px: touch-only - cluster only when pins actually touch (12px apart = edge-to-edge)
      minClusterSize: 2,
      maxZoom: 16,
      enableLocationGrouping: true,
      enableVisualClustering: true
    })
  }, [stableSales, stableViewport])

  // Early return if no sales - avoid unnecessary rendering
  if (stableSales.length === 0) {
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
          // Generate a numeric hash from the stable cluster ID for ClusterFeature compatibility
          // The stable ID ensures React keys are consistent, preventing unmount/remount flashing
          const numericId = pin.id.split('').reduce((acc, char) => {
            const hash = ((acc << 5) - acc) + char.charCodeAt(0)
            return hash & hash // Convert to 32-bit integer
          }, 0)
          
          return (
            <ClusterMarker
              key={pin.id} // Use stable string ID as React key to prevent flashing
              cluster={{
                id: numericId, // Numeric ID for ClusterFeature type compatibility
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
