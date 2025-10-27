'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'

interface DebugInfo {
  environment: string
  timestamp: string
  userAgent: string
  session: any
  profile: any
  cookies: Record<string, string>
  localStorage: Record<string, string>
  performance: {
    navigation: any
    memory: any
  }
}

export default function AuthDebugDashboard() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const { data: user } = useAuth()

  useEffect(() => {
    // Only show debug dashboard in development or when debug is enabled
    const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NODE_ENV === 'development'
    
    if (!isDebugMode) return

    const updateDebugInfo = () => {
      const info: DebugInfo = {
        environment: process.env.NODE_ENV || 'unknown',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        session: user,
        profile: null, // Would need to fetch from API
        cookies: document.cookie.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=')
          acc[key] = value
          return acc
        }, {} as Record<string, string>),
        localStorage: Object.keys(localStorage).reduce((acc, key) => {
          acc[key] = localStorage.getItem(key) || ''
          return acc
        }, {} as Record<string, string>),
        performance: {
          navigation: performance.getEntriesByType('navigation')[0],
          memory: (performance as any).memory || null,
        }
      }
      setDebugInfo(info)
    }

    updateDebugInfo()
    const interval = setInterval(updateDebugInfo, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [user])

  // Don't render if not in debug mode
  if (process.env.NEXT_PUBLIC_DEBUG !== 'true' && process.env.NODE_ENV !== 'development') {
    return null
  }

  if (!debugInfo) return null

  return (
    <>
      {/* Debug Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-4 right-4 z-50 bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-mono hover:bg-red-700 transition-colors"
        title="Toggle Auth Debug Dashboard"
      >
        🔧 AUTH DEBUG
      </button>

      {/* Debug Dashboard */}
      {isVisible && (
        <div className="fixed bottom-16 right-4 z-50 bg-black text-green-400 p-4 rounded-lg max-w-md max-h-96 overflow-auto text-xs font-mono border border-green-500">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-green-400 font-bold">🔧 AUTH DEBUG DASHBOARD</h3>
            <button
              onClick={() => setIsVisible(false)}
              className="text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-yellow-400">Environment:</span> {debugInfo.environment}
            </div>
            <div>
              <span className="text-yellow-400">Timestamp:</span> {debugInfo.timestamp}
            </div>

            <div>
              <span className="text-yellow-400">Session:</span>
              <pre className="text-xs mt-1 bg-gray-900 p-2 rounded overflow-x-auto">
                {JSON.stringify(debugInfo.session, null, 2)}
              </pre>
            </div>

            <div>
              <span className="text-yellow-400">Cookies:</span>
              <pre className="text-xs mt-1 bg-gray-900 p-2 rounded overflow-x-auto">
                {JSON.stringify(debugInfo.cookies, null, 2)}
              </pre>
            </div>

            <div>
              <span className="text-yellow-400">Performance:</span>
              <pre className="text-xs mt-1 bg-gray-900 p-2 rounded overflow-x-auto">
                {JSON.stringify({
                  loadTime: debugInfo.performance.navigation?.loadEventEnd - debugInfo.performance.navigation?.loadEventStart,
                  domContentLoaded: debugInfo.performance.navigation?.domContentLoadedEventEnd - debugInfo.performance.navigation?.domContentLoadedEventStart,
                  memory: debugInfo.performance.memory ? {
                    used: Math.round(debugInfo.performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
                    total: Math.round(debugInfo.performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB',
                    limit: Math.round(debugInfo.performance.memory.jsHeapSizeLimit / 1024 / 1024) + 'MB'
                  } : 'Not available'
                }, null, 2)}
              </pre>
            </div>

            <div className="pt-2 border-t border-green-500">
              <button
                onClick={() => {
                  console.clear()
                  console.log('🔧 AUTH DEBUG: Console cleared')
                }}
                className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
              >
                Clear Console
              </button>
              <button
                onClick={() => {
                  const debugData = {
                    ...debugInfo,
                    url: window.location.href,
                    referrer: document.referrer,
                  }
                  console.log('🔧 AUTH DEBUG DATA:', debugData)
                }}
                className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 ml-2"
              >
                Log to Console
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
