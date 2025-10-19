'use client'

import { useState, useEffect } from 'react'

interface DebugToggleProps {
  className?: string
}

export default function DebugToggle({ className = '' }: DebugToggleProps) {
  const [isDebugEnabled, setIsDebugEnabled] = useState(false)

  useEffect(() => {
    // Check if debug is enabled on mount
    setIsDebugEnabled(process.env.NEXT_PUBLIC_DEBUG === 'true')
  }, [])

  const toggleDebug = () => {
    const newValue = !isDebugEnabled
    setIsDebugEnabled(newValue)
    
    // Update environment variable (this only affects client-side)
    if (typeof window !== 'undefined') {
      // This is a client-side only toggle for development
      console.log(`Debug mode ${newValue ? 'enabled' : 'disabled'}`)
      console.log('Note: This only affects client-side debugging. Server-side debug requires NEXT_PUBLIC_DEBUG=true')
    }
  }

  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  return (
    <div className={`fixed top-4 right-4 z-50 ${className}`}>
      <button
        onClick={toggleDebug}
        className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
          isDebugEnabled
            ? 'bg-green-100 text-green-800 border border-green-300'
            : 'bg-gray-100 text-gray-600 border border-gray-300'
        }`}
        title="Toggle map debugging (client-side only)"
      >
        🐛 Debug: {isDebugEnabled ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}
