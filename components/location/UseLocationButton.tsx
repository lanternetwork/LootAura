'use client'

import React from 'react'
import { FaLocationArrow, FaSpinner, FaExclamationTriangle } from 'react-icons/fa'

interface UseLocationButtonProps {
  onClick: () => void
  loading: boolean
  error: string | null
  className?: string
}

export default function UseLocationButton({ 
  onClick, 
  loading, 
  error, 
  className = '' 
}: UseLocationButtonProps) {
  return (
    <div className={`flex flex-col items-center space-y-2 ${className}`}>
      <button
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] transition-colors"
      >
        {loading ? (
          <>
            <FaSpinner className="animate-spin mr-2" />
            Getting Location...
          </>
        ) : (
          <>
            <FaLocationArrow className="mr-2" />
            Use My Location
          </>
        )}
      </button>
      
      {error && (
        <div className="flex items-center text-red-600 text-sm">
          <FaExclamationTriangle className="mr-1" />
          {error}
        </div>
      )}
    </div>
  )
}