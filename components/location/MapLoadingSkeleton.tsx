'use client'

import React from 'react'

interface MapLoadingSkeletonProps {
  className?: string
}

export default function MapLoadingSkeleton({ className = '' }: MapLoadingSkeletonProps) {
  return (
    <div className={`w-full h-full bg-gray-100 animate-pulse ${className}`} data-testid="map-container">
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 bg-gray-300 rounded-full mx-auto mb-4 animate-pulse"></div>
          <div className="text-gray-500 text-sm">Load Map</div>
        </div>
      </div>
    </div>
  )
}
