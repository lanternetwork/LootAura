'use client'

import { useMemo, useState, useEffect } from 'react'
import { buildClusterIndex, getClustersForViewport, type SuperclusterIndex } from '@/lib/pins/clustering'
import { ClusterFeature, PinsProps } from '@/lib/pins/types'
import ClusterMarker from './ClusterMarker'
import PinMarker from './PinMarker'

interface PinsOverlayProps extends PinsProps {
  mapRef: React.RefObject<any>
  isClusteringEnabled: boolean
}

export default function PinsOverlay({ 
  sales, 
  selectedId, 
  onPinClick, 
  onClusterClick,
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
    if (!mapRef.current?.getMap) return null
    
    const map = mapRef.current.getMap()
    if (!map || !map.isStyleLoaded?.()) return null
    
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
  useEffect(() => {
    if (!viewportInfo) return
    
    const timeoutId = setTimeout(() => {
      setDebouncedViewport(viewportInfo)
    }, 100) // 100ms debounce
    
    return () => clearTimeout(timeoutId)
  }, [viewportInfo])

  // Get clusters for current viewport - only when needed
  const clusters = useMemo((): ClusterFeature[] => {
    if (!clusterIndex || !debouncedViewport || sales.length === 0) return []
    
    // Skip clustering for very small datasets
    if (sales.length < 2) {
      return sales.map(sale => ({
        id: parseInt(sale.id) || 0,
        count: 1,
        lat: sale.lat,
        lng: sale.lng,
        expandToZoom: debouncedViewport.zoom
      }))
    }
    
    const viewportClusters = getClustersForViewport(
      clusterIndex, 
      debouncedViewport.bounds, 
      debouncedViewport.zoom
    )
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PINS] viewport clusters', { 
        clusters: viewportClusters.length, 
        singles: sales.length, 
        zoom: debouncedViewport.zoom 
      })
    }
    
    return viewportClusters
  }, [clusterIndex, debouncedViewport, sales])

  // Render plain pins when clustering is disabled
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
            onClick={onPinClick}
          />
        ))}
      </>
    )
  }

  // Render clusters and individual pins when clustering is enabled
  return (
    <>
      {clusters.map(cluster => (
        <ClusterMarker
          key={cluster.id}
          cluster={cluster}
          onClick={onClusterClick}
        />
      ))}
    </>
  )
}
