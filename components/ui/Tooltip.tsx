'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'

/**
 * Lightweight tooltip component for supplemental information.
 * 
 * Guidelines:
 * - Tooltips are for supplemental info only (never the only way to access important information)
 * - Keep them short, plain language
 * - On mobile, tooltips may be disabled or show on tap/long-press
 */
interface TooltipProps {
  content: ReactNode
  children: ReactNode
  /** Disable tooltip on mobile/touch devices */
  disableOnMobile?: boolean
  /** Delay before showing tooltip (ms) */
  delay?: number
  /** Position relative to trigger */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** Additional className for tooltip content */
  className?: string
}

export function Tooltip({
  content,
  children,
  disableOnMobile = true,
  delay = 300,
  position = 'top',
  className = ''
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleMouseEnter = () => {
    if (disableOnMobile && isMobile) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  // Position classes
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-900 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-900 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-900 border-t-transparent border-b-transparent border-l-transparent'
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`absolute z-50 pointer-events-none ${positionClasses[position]} ${className}`}
          role="tooltip"
        >
          <div className="bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg whitespace-nowrap max-w-xs">
            {content}
            {/* Arrow */}
            <div
              className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Simple tooltip wrapper for map markers that need hover tooltips.
 * Uses Popup from react-map-gl for better positioning on map.
 */
export function MapMarkerTooltip({
  content,
  children,
  lat: _lat,
  lng: _lng
}: {
  content: ReactNode
  children: ReactNode
  lat: number
  lng: number
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  if (isMobile) {
    // On mobile, just render children without tooltip
    return <>{children}</>
  }

  return (
    <div
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      className="relative"
    >
      {children}
      {isVisible && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
          style={{
            // Position relative to marker
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg whitespace-nowrap max-w-xs">
            {content}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-t-gray-900 border-l-transparent border-r-transparent border-b-transparent" />
          </div>
        </div>
      )}
    </div>
  )
}

