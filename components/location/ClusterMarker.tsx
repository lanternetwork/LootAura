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

  // Determine size tier based on count
  const getSizeTier = (count: number): 'S' | 'M' | 'L' => {
    if (count >= 50) return 'L'
    if (count >= 10) return 'M'
    return 'S'
  }

  const sizeTier = getSizeTier(cluster.count)
  
  const sizeClasses = {
    S: 'w-4 h-4 text-[10px]',
    M: 'w-5 h-5 text-[10px]', 
    L: 'w-6 h-6 text-[11px]'
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
          ${sizeClasses[sizeTier]}
          bg-blue-600 hover:bg-blue-700 
          text-white font-semibold 
          rounded-full flex items-center justify-center
          shadow-sm select-none
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          transition-all duration-200
          cursor-pointer
        `}
        data-cluster-marker="true"
        data-cluster-id={cluster.id}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={`Cluster of ${cluster.count} sales. Press Enter to zoom in.`}
        title={`Cluster of ${cluster.count} sales`}
      >
        <span className="text-white font-bold">+</span>
      </button>
    </Marker>
  )
}