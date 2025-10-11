'use client'

import { useState, useEffect, useRef } from 'react'

interface FetchEvent {
  id: string
  endpoint: string
  params: Record<string, string>
  authority: string
  viewportSeq: number
  requestSeq: number
  status: 'pending' | 'success' | 'error'
  size?: number
  timeMs?: number
  timestamp: number
  suppressed?: boolean
}

interface DiagnosticOverlayProps {
  isVisible: boolean
  onToggle: () => void
}

export default function DiagnosticOverlay({ isVisible, onToggle }: DiagnosticOverlayProps) {
  const [events, setEvents] = useState<FetchEvent[]>([])
  const [suppressedCount, setSuppressedCount] = useState(0)
  const eventIdRef = useRef(0)

  useEffect(() => {
    // Listen for fetch events from the global event emitter
    const handleFetchEvent = (event: FetchEvent) => {
      setEvents(prev => {
        const newEvents = [event, ...prev].slice(0, 10) // Keep last 10
        return newEvents
      })
      
      if (event.suppressed) {
        setSuppressedCount(prev => prev + 1)
      }
    }

    // Global event emitter for fetch events
    if (typeof window !== 'undefined') {
      (window as any).__DIAGNOSTIC_FETCH_EVENTS__ = handleFetchEvent
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__DIAGNOSTIC_FETCH_EVENTS__
      }
    }
  }, [])

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium z-50"
      >
        Debug ({events.length})
        {suppressedCount > 0 && (
          <span className="ml-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs">
            {suppressedCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-xl p-4 max-w-md max-h-96 overflow-y-auto z-50">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Fetch Diagnostics</h3>
        <button
          onClick={onToggle}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ✕
        </button>
      </div>
      
      {suppressedCount > 0 && (
        <div className="mb-3 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-800">
          <strong>⚠️ {suppressedCount} wide fetches suppressed under MAP authority</strong>
        </div>
      )}

      <div className="space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">No fetch events yet</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className={`p-2 rounded text-xs ${
                event.suppressed 
                  ? 'bg-red-50 border border-red-200' 
                  : event.status === 'error' 
                    ? 'bg-yellow-50 border border-yellow-200'
                    : 'bg-gray-50 border border-gray-200'
              }`}
            >
              <div className="font-mono text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold">{event.endpoint}</span>
                  <span className={`px-1 rounded text-xs ${
                    event.suppressed 
                      ? 'bg-red-200 text-red-800' 
                      : event.status === 'error' 
                        ? 'bg-yellow-200 text-yellow-800'
                        : 'bg-green-200 text-green-800'
                  }`}>
                    {event.suppressed ? 'SUPPRESSED' : event.status.toUpperCase()}
                  </span>
                </div>
                
                {Object.keys(event.params).length > 0 && (
                  <div className="mt-1 text-gray-600">
                    {Object.entries(event.params).map(([key, value]) => (
                      <div key={key} className="truncate">
                        <span className="text-gray-500">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="mt-1 text-gray-500">
                  <div>Authority: {event.authority}</div>
                  <div>ViewportSeq: {event.viewportSeq} | RequestSeq: {event.requestSeq}</div>
                  {event.timeMs && <div>Time: {event.timeMs}ms</div>}
                  {event.size && <div>Size: {event.size} bytes</div>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
