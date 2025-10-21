'use client'

import React from 'react'

interface MapLoadingIndicatorProps {
  className?: string
}

export default function MapLoadingIndicator({ className = '' }: MapLoadingIndicatorProps) {
  return (
    <div className={`absolute top-4 left-4 z-10 ${className}`}>
      <div className="bg-white bg-opacity-90 px-3 py-2 rounded-lg shadow-md flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
        <span className="text-sm text-gray-700 font-medium">Loading map...</span>
      </div>
    </div>
  )
}
