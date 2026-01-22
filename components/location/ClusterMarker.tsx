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

  return (
    <Marker
      longitude={cluster.lng}
      latitude={cluster.lat}
      anchor="center"
      data-testid="cluster"
    >
      {/* Platform-specific hitbox: tight on desktop, forgiving on touch */}
      <div
        className="relative flex items-center justify-center transition-transform duration-150 ease-out"
        style={{
          // Desktop (mouse): tight hitbox matching SVG size (14px)
          // Mobile (touch): larger hitbox (44px) for easier tapping
          width: '44px',
          height: '44px',
          minWidth: '44px',
          minHeight: '44px',
          // Ensure extra hit area on touch devices is transparent
          backgroundColor: 'transparent'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Cluster of ${cluster.count} sales. Press Enter to zoom in.`}
        data-cluster-marker="true"
        data-cluster-id={cluster.id}
        title={`${cluster.count} sales at this location`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          className="w-3.5 h-3.5"
          style={{
            cursor: 'pointer',
            outline: 'none',
            position: 'relative',
            zIndex: 1,
            pointerEvents: 'none' // Prevent double-click events
          }}
        >
          {/* Orange cluster pin: lighter fill + darker same-hue stroke */}
          <circle
            cx="8"
            cy="8"
            r="7"
            fill="#f97316"
            stroke="#ea580c"
            strokeWidth="1.5"
          />
          {/* Centered text: count or + on hover */}
          <text
            x="8"
            y="8"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize="8"
            fontWeight="bold"
            style={{ pointerEvents: 'none' }}
          >
            {isHovered ? '+' : cluster.count}
          </text>
        </svg>
      </div>
    </Marker>
  )
}