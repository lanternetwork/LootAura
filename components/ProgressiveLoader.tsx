'use client'

import { useState, useEffect, ReactNode } from 'react'
import SaleCardSkeleton from './SaleCardSkeleton'

interface ProgressiveLoaderProps {
  children: ReactNode
  isLoading: boolean
  skeletonCount?: number
  delay?: number
  className?: string
}

export default function ProgressiveLoader({ 
  children, 
  isLoading, 
  skeletonCount = 6,
  delay = 0,
  className = ''
}: ProgressiveLoaderProps) {
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [hasShownContent, setHasShownContent] = useState(false)

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setShowSkeleton(true)
      }, delay)
      return () => clearTimeout(timer)
    } else {
      setShowSkeleton(false)
      setHasShownContent(true)
    }
  }, [isLoading, delay])

  // Show skeleton while loading
  if (showSkeleton && !hasShownContent) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <SaleCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  // Show content with fade-in animation
  return (
    <div className={`transition-opacity duration-300 ${hasShownContent ? 'opacity-100' : 'opacity-0'} ${className}`}>
      {children}
    </div>
  )
}

// Hook for progressive data loading
export function useProgressiveLoading<T>(
  data: T[] | undefined,
  isLoading: boolean,
  options: {
    batchSize?: number
    initialBatch?: number
    delay?: number
  } = {}
) {
  const {
    batchSize = 6,
    initialBatch = 6,
    delay = 100
  } = options

  const [displayedCount, setDisplayedCount] = useState(initialBatch)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const displayedData = data?.slice(0, displayedCount) || []
  const hasMore = data ? displayedCount < data.length : false

  const loadMore = () => {
    if (hasMore && !isLoadingMore) {
      setIsLoadingMore(true)
      
      setTimeout(() => {
        setDisplayedCount(prev => Math.min(prev + batchSize, data?.length || 0))
        setIsLoadingMore(false)
      }, delay)
    }
  }

  const reset = () => {
    setDisplayedCount(initialBatch)
    setIsLoadingMore(false)
  }

  // Reset when data changes
  useEffect(() => {
    reset()
  }, [data])

  return {
    displayedData,
    hasMore,
    loadMore,
    isLoadingMore,
    isLoading: isLoading || displayedCount === 0
  }
}

// Skeleton for map loading
export function MapSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-gray-200 animate-pulse rounded-lg ${className}`}>
      <div className="aspect-video bg-gray-300 rounded-lg flex items-center justify-center">
        <div className="text-gray-500">Loading map...</div>
      </div>
    </div>
  )
}

// Skeleton for filter loading
export function FilterSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          <div className="h-3 bg-gray-200 rounded w-3/4"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    </div>
  )
}
