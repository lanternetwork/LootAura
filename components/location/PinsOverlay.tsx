'use client'

import { useMemo, useState, useEffect } from 'react'
import { buildClusterIndex, getClustersForViewport, type SuperclusterIndex } from '@/lib/pins/clustering'
import { ClusterFeature, PinsProps } from '@/lib/pins/types'
import PinMarker from './PinMarker'
import ClusterMarker from './ClusterMarker'

interface PinsOverlayProps extends PinsProps {
  mapRef: React.RefObject<any>
  isClusteringEnabled: boolean
}

export default function PinsOverlay({ 
  sales, 
  selectedId, 
  onPinClick, 
  onClusterClick: _onClusterClick,
  mapRef,
  isClusteringEnabled 
}: PinsOverlayProps) {
  
  // Debounced viewport state to prevent excessive recalculations
  const [debouncedViewport, setDebouncedViewport] = useState<{
    bounds: [number, number, number, number]
    zoom: number
  } | null>(null)
  
  // Build cluster index when clustering is enabled
  const clusterIndex = useMemo((): SuperclusterIndex | null => {
    if (!isClusteringEnabled || sales.length === 0) {
      return null
    }
    
    return buildClusterIndex(sales)
  }, [sales, isClusteringEnabled])

  // Get current viewport bounds and zoom - only when map is ready
  const viewportInfo = useMemo(() => {
    if (!mapRef.current?.getMap) {
      return null
    }
    
    const map = mapRef.current.getMap()
    if (!map || !map.isStyleLoaded?.()) {
      return null
    }
    
    const bounds = map.getBounds()
    const zoom = map.getZoom()
    
    return {
      bounds: [
        bounds.getWest(),
        bounds.getSouth(), 
        bounds.getEast(),
        bounds.getNorth()
      ] as [number, number, number, number],
      zoom
    }
  }, [mapRef, sales]) // Add sales as dependency to recalculate when data changes
  
  // Debounce viewport updates to prevent excessive recalculations
  // But don't debounce on initial load to avoid slow first render
  useEffect(() => {
    if (!viewportInfo) return
    
    // If this is the first viewport info, set it immediately
    if (!debouncedViewport) {
      setDebouncedViewport(viewportInfo)
      return
    }
    
    // For subsequent updates, debounce to prevent excessive recalculations
    const timeoutId = setTimeout(() => {
      setDebouncedViewport(viewportInfo)
    }, 50) // 50ms debounce for better responsiveness
    
    return () => clearTimeout(timeoutId)
  }, [viewportInfo, debouncedViewport])

  // Get clusters for current viewport - only when needed
  const _clusters = useMemo((): ClusterFeature[] => {
    if (!clusterIndex || !debouncedViewport || sales.length < 2) {
      return []
    }
    
    const viewportClusters = getClustersForViewport(
      clusterIndex, 
      debouncedViewport.bounds, 
      debouncedViewport.zoom
    )
    // Only treat features with count > 1 as clusters
    const clustersOnly = viewportClusters.filter(c => c.count > 1)
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PINS] viewport clusters', { 
        clusters: clustersOnly.length, 
        singles: sales.length, 
        zoom: debouncedViewport.zoom 
      })
    }
    
    return clustersOnly
  }, [clusterIndex, debouncedViewport, sales])

  // Early return if no sales to prevent unnecessary renders
  if (sales.length === 0) {
    return null
  }
  
  // Debug logging - only when there are sales
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PINS_OVERLAY] Render v3:', {
      salesCount: sales.length,
      isClusteringEnabled,
      hasMapRef: !!mapRef.current
    })
  }

  // Clustering path: render clusters when present; otherwise render individual pins
  if (isClusteringEnabled && mapRef.current?.getMap) {
    const clustersOnly = _clusters.filter(c => c.count > 1)
    if (clustersOnly.length > 0) {
      return (
        <>
          {clustersOnly.map(cluster => (
            <ClusterMarker
              key={cluster.id}
              cluster={cluster}
              onClick={_onClusterClick}
            />
          ))}
        </>
      )
    }
    // No clusters at current zoom → fall back to individual pins
    return (
      <>
        {sales.map(sale => (
          <PinMarker
            key={sale.id}
            id={sale.id}
            lat={sale.lat}
            lng={sale.lng}
            isSelected={selectedId === sale.id}
            isFeatured={(sale as any).isFeatured === true || (sale as any).is_featured === true}
            onClick={onPinClick}
          />
        ))}
      </>
    )
  }

  // Clustering disabled: render individual pins. If clustering is enabled but mapRef is invalid, render nothing.
  if (!isClusteringEnabled) {
    return (
      <>
        {sales.map(sale => (
          <PinMarker
            key={sale.id}
            id={sale.id}
            lat={sale.lat}
            lng={sale.lng}
            isSelected={selectedId === sale.id}
            isFeatured={(sale as any).isFeatured === true || (sale as any).is_featured === true}
            onClick={onPinClick}
          />
        ))}
      </>
    )
  }

  return null
}
