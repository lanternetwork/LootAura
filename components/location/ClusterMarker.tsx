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
  console.log('[CLUSTER MARKER] Component rendered!', { 
    clusterId: cluster.id, 
    clusterType: cluster.type,
    clusterCount: cluster.count,
    hasOnClick: !!onClick 
  })
  const handleClick = useCallback((event: React.MouseEvent) => {
    console.log('[CLUSTER MARKER] Click detected!', { 
      clusterId: cluster.id, 
      clusterType: cluster.type,
      hasOnClick: !!onClick 
    })
    console.log('[CLUSTER MARKER] Event details:', {
      type: event.type,
      target: event.target,
      currentTarget: event.currentTarget,
      button: event.button,
      clientX: event.clientX,
      clientY: event.clientY
    })
    
    // Prevent default and stop propagation immediately
    event.preventDefault()
    event.stopPropagation()
    
    console.log('[CLUSTER MARKER] About to call onClick with cluster:', cluster)
    onClick?.(cluster)
    console.log('[CLUSTER MARKER] onClick called successfully')
  }, [cluster, onClick])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onKeyDown?.(cluster, event)
    }
  }, [cluster, onKeyDown])

  // Size-based styling - much smaller for better clustering
  const sizeClasses = {
    small: 'w-4 h-4 text-xs',
    medium: 'w-5 h-5 text-xs',
    large: 'w-6 h-6 text-sm'
  }

  const sizeStyles = {
    small: { minWidth: '16px', minHeight: '16px' },
    medium: { minWidth: '20px', minHeight: '20px' },
    large: { minWidth: '24px', minHeight: '24px' }
  }

  if (cluster.type === 'point') {
    // Individual point marker - render as small dot
    return (
      <Marker
        longitude={cluster.lon}
        latitude={cluster.lat}
        anchor="center"
      >
        <button
          className="w-3 h-3 bg-red-500 rounded-full border border-white shadow-md hover:bg-red-600 focus:outline-none focus:ring-1 focus:ring-red-500"
          data-cluster-marker="true"
          data-cluster-id={cluster.id}
          onClick={handleClick}
          onMouseDown={(e) => {
            console.log('[CLUSTER MARKER] Point MouseDown detected!', { clusterId: cluster.id })
            e.preventDefault()
            e.stopPropagation()
            
            // Also trigger the click handler on mouse down for more reliable event handling
            if (onClick) {
              console.log('[CLUSTER MARKER] Point MouseDown triggering onClick:', cluster.id)
              onClick(cluster)
            }
          }}
          onMouseUp={(e) => {
            console.log('[CLUSTER MARKER] Point MouseUp detected!', { clusterId: cluster.id })
            e.preventDefault()
            e.stopPropagation()
          }}
          aria-label={`Sale at this location`}
        />
      </Marker>
    )
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
        data-cluster-marker="true"
        data-cluster-id={cluster.id}
        onClick={handleClick}
        onMouseDown={(e) => {
          console.log('[CLUSTER MARKER] MouseDown detected!', { clusterId: cluster.id })
          e.preventDefault()
          e.stopPropagation()
          
          // Also trigger the click handler on mouse down for more reliable event handling
          if (onClick) {
            console.log('[CLUSTER MARKER] MouseDown triggering onClick:', cluster.id)
            onClick(cluster)
          }
        }}
        onMouseUp={(e) => {
          console.log('[CLUSTER MARKER] MouseUp detected!', { clusterId: cluster.id })
          e.preventDefault()
          e.stopPropagation()
        }}
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
