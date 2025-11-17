'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to detect if the current viewport is mobile (< 768px)
 * Uses window.innerWidth and updates on resize
 * 
 * Defaults to false on SSR/first render for safe hydration
 */
export function useIsMobile(): boolean {
  // Default to false on SSR/first render
  const [isMobile, setIsMobile] = useState<boolean>(false)

  useEffect(() => {
    // Check on mount and update
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    // Initial check
    checkMobile()

    // Update on resize
    const handleResize = () => {
      checkMobile()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}



