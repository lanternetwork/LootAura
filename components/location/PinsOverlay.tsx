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
  
  // Debug logging - always show for troubleshooting
  console.log('[PINS_OVERLAY] Render:', {
    salesCount: sales.length,
    isClusteringEnabled,
    hasMapRef: !!mapRef.current,
    sales: sales.slice(0, 2) // Log first 2 sales for debugging
  })
  
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
    console.log('[PINS_OVERLAY] Viewport calculation:', {
      hasMapRef: !!mapRef.current,
      hasGetMap: !!mapRef.current?.getMap
    })
    
    if (!mapRef.current?.getMap) {
      console.log('[PINS_OVERLAY] No map ref or getMap method')
      return null
    }
    
    const map = mapRef.current.getMap()
    if (!map) {
      console.log('[PINS_OVERLAY] No map instance')
      return null
    }
    
    if (!map.isStyleLoaded?.()) {
      console.log('[PINS_OVERLAY] Map style not loaded yet')
      return null
    }
    
    const bounds = map.getBounds()
    const zoom = map.getZoom()
    
    console.log('[PINS_OVERLAY] Viewport calculated:', { 
      zoom, 
      salesCount: sales.length,
      bounds: {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
      }
    })
    
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
  const clusters = useMemo((): ClusterFeature[] => {
    console.log('[PINS_OVERLAY] Clusters calculation:', {
      hasClusterIndex: !!clusterIndex,
      hasDebouncedViewport: !!debouncedViewport,
      salesLength: sales.length,
      debouncedViewport: debouncedViewport
    })
    
    if (!clusterIndex || !debouncedViewport || sales.length === 0) {
      console.log('[PINS_OVERLAY] Returning empty clusters - missing requirements')
      return []
    }
    
    // Skip clustering for very small datasets
    if (sales.length < 2) {
      console.log('[PINS_OVERLAY] Small dataset - returning individual pins')
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
    console.log('[PINS_OVERLAY] Rendering plain pins:', { salesCount: sales.length })
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
  console.log('[PINS_OVERLAY] Rendering clusters:', { clustersCount: clusters.length })
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
