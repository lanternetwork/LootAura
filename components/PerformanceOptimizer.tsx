'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface PerformanceOptimizerProps {
  currentFilters: {
    lat?: number
    lng?: number
    distanceKm?: number
    dateRange?: string
    categories?: string[]
  }
  onPrefetchData: (filters: any) => void
}

export default function PerformanceOptimizer({ 
  currentFilters, 
  onPrefetchData 
}: PerformanceOptimizerProps) {
  const router = useRouter()
  const prefetchCache = useRef<Map<string, boolean>>(new Map())
  const prefetchTimeout = useRef<NodeJS.Timeout>()

  // Prefetch data for likely next user actions
  const prefetchAdjacentData = useCallback(() => {
    if (!currentFilters.lat || !currentFilters.lng) return

    const baseKey = `${currentFilters.lat},${currentFilters.lng}`
    
    // Prefetch nearby areas (adjacent map tiles)
    const adjacentOffsets = [
      { lat: 0.01, lng: 0.01 },   // Northeast
      { lat: 0.01, lng: -0.01 },  // Northwest  
      { lat: -0.01, lng: 0.01 },  // Southeast
      { lat: -0.01, lng: -0.01 }, // Southwest
    ]

    adjacentOffsets.forEach((offset, index) => {
      const adjacentLat = currentFilters.lat! + offset.lat
      const adjacentLng = currentFilters.lng! + offset.lng
      const key = `${adjacentLat},${adjacentLng}`
      
      if (!prefetchCache.current.has(key)) {
        prefetchCache.current.set(key, true)
        
        // Prefetch markers for adjacent areas
        setTimeout(() => {
          onPrefetchData({
            lat: adjacentLat,
            lng: adjacentLng,
            distanceKm: currentFilters.distanceKm || 25,
            dateRange: currentFilters.dateRange || 'any',
            categories: currentFilters.categories || []
          })
        }, index * 100) // Stagger requests
      }
    })
  }, [currentFilters, onPrefetchData])

  // Prefetch common date ranges
  const prefetchCommonDateRanges = useCallback(() => {
    const commonRanges = ['today', 'weekend', 'next_weekend']
    
    commonRanges.forEach((dateRange, index) => {
      if (dateRange !== currentFilters.dateRange) {
        setTimeout(() => {
          onPrefetchData({
            ...currentFilters,
            dateRange
          })
        }, (index + 4) * 100) // After adjacent areas
      }
    })
  }, [currentFilters, onPrefetchData])

  // Prefetch popular categories
  const prefetchPopularCategories = useCallback(() => {
    const popularCategories = [
      ['furniture'],
      ['electronics'], 
      ['tools'],
      ['clothing'],
      ['books']
    ]
    
    popularCategories.forEach((categories, index) => {
      if (!categories.every(cat => currentFilters.categories?.includes(cat))) {
        setTimeout(() => {
          onPrefetchData({
            ...currentFilters,
            categories
          })
        }, (index + 7) * 100) // After date ranges
      }
    })
  }, [currentFilters, onPrefetchData])

  // Main prefetch orchestration
  useEffect(() => {
    // Clear existing timeout
    if (prefetchTimeout.current) {
      clearTimeout(prefetchTimeout.current)
    }

    // Debounce prefetching to avoid excessive requests
    prefetchTimeout.current = setTimeout(() => {
      prefetchAdjacentData()
      prefetchCommonDateRanges()
      prefetchPopularCategories()
    }, 2000) // Wait 2 seconds after filter changes

    return () => {
      if (prefetchTimeout.current) {
        clearTimeout(prefetchTimeout.current)
      }
    }
  }, [
    currentFilters.lat,
    currentFilters.lng,
    currentFilters.distanceKm,
    currentFilters.dateRange,
    currentFilters.categories,
    prefetchAdjacentData,
    prefetchCommonDateRanges,
    prefetchPopularCategories
  ])

  // Prefetch on route changes
  useEffect(() => {
    const handleRouteChange = () => {
      // Clear cache on route change
      prefetchCache.current.clear()
    }

    // Note: Next.js App Router doesn't have router.events
    // This is a placeholder for future route change detection
    // In App Router, we rely on component unmounting for cleanup
    
    return () => {
      // Cleanup on component unmount
      handleRouteChange()
    }
  }, [])

  return null // This is a background component
}

// Hook for optimistic updates
export function useOptimisticUpdates() {
  const optimisticData = useRef<Map<string, any>>(new Map())
  
  const setOptimisticData = useCallback((key: string, data: any) => {
    optimisticData.current.set(key, {
      ...data,
      _optimistic: true,
      _timestamp: Date.now()
    })
  }, [])

  const clearOptimisticData = useCallback((key: string) => {
    optimisticData.current.delete(key)
  }, [])

  const getOptimisticData = useCallback((key: string) => {
    return optimisticData.current.get(key)
  }, [])

  const clearStaleOptimisticData = useCallback(() => {
    const now = Date.now()
    const staleThreshold = 30000 // 30 seconds
    
    for (const [key, data] of optimisticData.current.entries()) {
      if (data._timestamp && (now - data._timestamp) > staleThreshold) {
        optimisticData.current.delete(key)
      }
    }
  }, [])

  // Clean up stale data periodically
  useEffect(() => {
    const interval = setInterval(clearStaleOptimisticData, 10000) // Every 10 seconds
    return () => clearInterval(interval)
  }, [clearStaleOptimisticData])

  return {
    setOptimisticData,
    clearOptimisticData,
    getOptimisticData
  }
}
