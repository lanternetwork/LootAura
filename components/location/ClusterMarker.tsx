'use client'

import { useCallback, useState } from 'react'
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
  const [isHovered, setIsHovered] = useState(false)

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

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsHovered(true)
  }, [])

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsHovered(false)
  }, [])

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
          bg-[var(--accent-primary)]
          text-white font-bold
          rounded-full flex items-center justify-center
          shadow-lg select-none
          cursor-pointer hover:scale-110 transition-transform
          focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2
        `}
        data-cluster-marker="true"
        data-cluster-id={cluster.id}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={`Cluster of ${cluster.count} sales. Press Enter to zoom in.`}
        title={`${cluster.count} sales at this location`}
      >
        <span className="text-white font-bold leading-none">
          {isHovered ? '+' : cluster.count}
        </span>
      </button>
    </Marker>
  )
}