'use client'

import { useCallback } from 'react'
import { Marker } from 'react-map-gl'
import { ClusterFeature } from '@/lib/pins/types'

interface ClusterMarkerProps {
  cluster: ClusterFeature
  onClick?: (cluster: ClusterFeature) => void
  onKeyDown?: (cluster: ClusterFeature, event: React.KeyboardEvent) => void
}

export default function ClusterMarker({ 
  cluster, 
  onClick, 
  onKeyDown 
}: ClusterMarkerProps) {
  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onClick?.(cluster)
  }, [cluster, onClick])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onKeyDown?.(cluster, event)
    }
  }, [cluster, onKeyDown])

  // Fixed size to match individual pins (12px)
  const sizeClass = 'w-3 h-3 text-[8px]'

  return (
    <Marker
      longitude={cluster.lng}
      latitude={cluster.lat}
      anchor="center"
      data-testid="cluster"
    >
      <button
        className={`
          ${sizeClass}
          bg-blue-600
          text-white font-semibold 
          rounded-full flex items-center justify-center
          shadow-sm select-none
          /* remove focus/hover effects to prevent size/visibility thrash */
          cursor-pointer
        `}
        data-cluster-marker="true"
        data-cluster-id={cluster.id}
        onClick={handleClick}
        onMouseEnter={(e) => { e.stopPropagation() }}
        onMouseLeave={(e) => { e.stopPropagation() }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={`Cluster of ${cluster.count} sales. Press Enter to zoom in.`}
        title={`Cluster of ${cluster.count} sales`}
      >
        <span className="text-white font-bold">{cluster.count}</span>
      </button>
    </Marker>
  )
}