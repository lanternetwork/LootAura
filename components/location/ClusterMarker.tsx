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

  // Dynamic size based on cluster count for better visibility
  const getSizeClass = () => {
    if (cluster.count >= 100) return 'w-10 h-10 text-xs'
    if (cluster.count >= 50) return 'w-9 h-9 text-xs'
    if (cluster.count >= 20) return 'w-8 h-8 text-[10px]'
    if (cluster.count >= 10) return 'w-7 h-7 text-[9px]'
    return 'w-6 h-6 text-[8px]'
  }

  return (
    <Marker
      longitude={cluster.lng}
      latitude={cluster.lat}
      anchor="center"
      data-testid="cluster"
    >
      <button
        className={`
          ${getSizeClass()}
          bg-[var(--accent-primary)]
          text-white font-bold
          rounded-full flex items-center justify-center
          shadow-lg border-2 border-white select-none
          cursor-pointer hover:scale-110 transition-transform
          focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2
        `}
        data-cluster-marker="true"
        data-cluster-id={cluster.id}
        onClick={handleClick}
        onMouseEnter={(e) => { e.stopPropagation() }}
        onMouseLeave={(e) => { e.stopPropagation() }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={`Cluster of ${cluster.count} sales. Press Enter to zoom in.`}
        title={`${cluster.count} sales at this location`}
      >
        <span className="text-white font-bold leading-none">{cluster.count}</span>
      </button>
    </Marker>
  )
}