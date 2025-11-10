'use client'

import { useEffect, useState, useRef } from 'react'

interface AttributionOSMProps {
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'
  className?: string
  containerRef?: React.RefObject<HTMLDivElement>
}

export default function AttributionOSM({ 
  position = 'bottom-right',
  className = '',
  containerRef
}: AttributionOSMProps) {
  const [safePosition, setSafePosition] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({})
  const attributionRef = useRef<HTMLDivElement>(null)

  // Calculate visible area and position attribution within it
  useEffect(() => {
    if (!containerRef?.current || !attributionRef.current) return

    const calculateSafePosition = () => {
      const container = containerRef.current
      const attribution = attributionRef.current
      if (!container || !attribution) return

      const containerRect = container.getBoundingClientRect()
      const attributionRect = attribution.getBoundingClientRect()
      
      // Get the visible area of the container (accounting for any clipping)
      const visibleWidth = containerRect.width
      const visibleHeight = containerRect.height
      
      // Calculate safe margins (padding from edges)
      const margin = 8 // 8px margin from edges
      const attributionWidth = attributionRect.width || 150 // Estimate if not measured yet
      const attributionHeight = attributionRect.height || 20 // Estimate if not measured yet
      
      let newPosition: { top?: number; bottom?: number; left?: number; right?: number } = {}
      
      // Calculate position based on desired position, ensuring it's within visible bounds
      if (position === 'bottom-right') {
        newPosition = {
          bottom: margin,
          right: margin
        }
        // Ensure it doesn't overflow on the right
        if (attributionWidth + margin > visibleWidth) {
          newPosition.right = Math.max(margin, visibleWidth - attributionWidth - margin)
        }
        // Ensure it doesn't overflow on the bottom
        if (attributionHeight + margin > visibleHeight) {
          newPosition.bottom = Math.max(margin, visibleHeight - attributionHeight - margin)
        }
      } else if (position === 'top-right') {
        newPosition = {
          top: margin,
          right: margin
        }
        // Ensure it doesn't overflow on the right
        if (attributionWidth + margin > visibleWidth) {
          newPosition.right = Math.max(margin, visibleWidth - attributionWidth - margin)
        }
        // Ensure it doesn't overflow on the top
        if (attributionHeight + margin > visibleHeight) {
          newPosition.top = Math.max(margin, visibleHeight - attributionHeight - margin)
        }
      } else if (position === 'bottom-left') {
        newPosition = {
          bottom: margin,
          left: margin
        }
        // Ensure it doesn't overflow on the left
        if (attributionWidth + margin > visibleWidth) {
          newPosition.left = Math.max(margin, visibleWidth - attributionWidth - margin)
        }
        // Ensure it doesn't overflow on the bottom
        if (attributionHeight + margin > visibleHeight) {
          newPosition.bottom = Math.max(margin, visibleHeight - attributionHeight - margin)
        }
      } else if (position === 'top-left') {
        newPosition = {
          top: margin,
          left: margin
        }
        // Ensure it doesn't overflow on the left
        if (attributionWidth + margin > visibleWidth) {
          newPosition.left = Math.max(margin, visibleWidth - attributionWidth - margin)
        }
        // Ensure it doesn't overflow on the top
        if (attributionHeight + margin > visibleHeight) {
          newPosition.top = Math.max(margin, visibleHeight - attributionHeight - margin)
        }
      }
      
      setSafePosition(newPosition)
    }

    // Calculate on mount and resize
    calculateSafePosition()
    
    // Use ResizeObserver to recalculate when container size changes
    const resizeObserver = new ResizeObserver(() => {
      calculateSafePosition()
    })
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    // Also observe the attribution element to get its actual size
    if (attributionRef.current) {
      resizeObserver.observe(attributionRef.current)
    }
    
    // Listen for window resize
    window.addEventListener('resize', calculateSafePosition)
    
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', calculateSafePosition)
    }
  }, [containerRef, position])

  // Fallback to Tailwind classes if no container ref provided
  const positionClasses = {
    'top-right': 'top-2 right-2',
    'bottom-right': 'bottom-2 right-2',
    'top-left': 'top-2 left-2',
    'bottom-left': 'bottom-2 left-2'
  }

  return (
    <div 
      ref={attributionRef}
      className={`absolute z-[100] pointer-events-none ${!containerRef ? positionClasses[position] : ''} ${className}`}
      role="contentinfo"
      style={{ 
        position: 'absolute',
        ...(containerRef ? safePosition : {})
      }}
    >
      <div className="pointer-events-auto bg-white/80 dark:bg-zinc-900/80 rounded px-2 py-1 shadow opacity-80 hover:opacity-100 transition-opacity">
        <div className="text-[10px] leading-tight text-gray-700 dark:text-gray-300">
          <span>
            ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-900 dark:hover:text-gray-100"
              aria-label="OpenStreetMap copyright information"
            >
              OpenStreetMap
            </a>{' '}
            contributors
          </span>
        </div>
      </div>
    </div>
  )
}

