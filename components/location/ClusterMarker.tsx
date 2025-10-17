'use client'

import { useCallback } from 'react'
import { Marker } from 'react-map-gl'
import { ClusterResult } from '@/lib/clustering'

interface ClusterMarkerProps {
  cluster: ClusterResult
  onClick?: (cluster: ClusterResult) => void
  onKeyDown?: (cluster: ClusterResult, event: React.KeyboardEvent) => void
  size?: 'small' | 'medium' | 'large'
}

export default function ClusterMarker({ 
  cluster, 
  onClick, 
  onKeyDown,
  size = 'medium' 
}: ClusterMarkerProps) {
  const handleClick = useCallback(() => {
    onClick?.(cluster)
  }, [cluster, onClick])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onKeyDown?.(cluster, event)
    }
  }, [cluster, onKeyDown])

  // Size-based styling
  const sizeClasses = {
    small: 'w-8 h-8 text-xs',
    medium: 'w-10 h-10 text-sm',
    large: 'w-12 h-12 text-base'
  }

  const sizeStyles = {
    small: { minWidth: '32px', minHeight: '32px' },
    medium: { minWidth: '40px', minHeight: '40px' },
    large: { minWidth: '48px', minHeight: '48px' }
  }

  if (cluster.type === 'point') {
    // Individual point marker - render as before
    return null
  }

  return (
    <Marker
      longitude={cluster.lon}
      latitude={cluster.lat}
      anchor="center"
    >
      <button
        className={`
          ${sizeClasses[size]}
          bg-blue-600 hover:bg-blue-700 
          text-white font-semibold 
          rounded-full border-2 border-white 
          shadow-lg hover:shadow-xl
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          transition-all duration-200
          flex items-center justify-center
          cursor-pointer
        `}
        style={sizeStyles[size]}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={`Cluster of ${cluster.count} sales. Press Enter to zoom in.`}
        title={`Cluster of ${cluster.count} sales`}
      >
        {cluster.count}
      </button>
    </Marker>
  )
}
