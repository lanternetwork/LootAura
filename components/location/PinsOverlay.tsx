'use client'

import { useMemo } from 'react'
import { buildClusterIndex, getClustersForViewport, type SuperclusterIndex } from '@/lib/pins/clustering'
import { PinPoint, ClusterFeature, PinsProps } from '@/lib/pins/types'
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
  
  // Build cluster index when clustering is enabled
  const clusterIndex = useMemo((): SuperclusterIndex | null => {
    if (!isClusteringEnabled || sales.length === 0) {
      return null
    }
    
    return buildClusterIndex(sales)
  }, [sales, isClusteringEnabled])

  // Get current viewport bounds and zoom
  const viewportInfo = useMemo(() => {
    if (!mapRef.current?.getMap) return null
    
    const map = mapRef.current.getMap()
    if (!map) return null
    
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
  }, [mapRef])

  // Get clusters for current viewport
  const clusters = useMemo((): ClusterFeature[] => {
    if (!clusterIndex || !viewportInfo) return []
    
    const viewportClusters = getClustersForViewport(
      clusterIndex, 
      viewportInfo.bounds, 
      viewportInfo.zoom
    )
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PINS] viewport clusters', { 
        clusters: viewportClusters.length, 
        singles: sales.length, 
        zoom: viewportInfo.zoom 
      })
    }
    
    return viewportClusters
  }, [clusterIndex, viewportInfo, sales.length])

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
