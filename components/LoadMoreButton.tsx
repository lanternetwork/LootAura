'use client'

import { useState } from 'react'

interface LoadMoreButtonProps {
  onLoadMore: () => Promise<void>
  hasMore: boolean
  loading: boolean
  className?: string
}

export default function LoadMoreButton({ onLoadMore, hasMore, loading, className = '' }: LoadMoreButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    if (isLoading || !hasMore) return
    
    setIsLoading(true)
    try {
      await onLoadMore()
    } finally {
      setIsLoading(false)
    }
  }

  if (!hasMore) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-500">No more sales to load</p>
      </div>
    )
  }

  return (
    <div className={`text-center py-8 ${className}`}>
      <button
        onClick={handleClick}
        disabled={isLoading || loading}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Loading more...
          </div>
        ) : (
          'Load More Sales'
        )}
      </button>
    </div>
  )
}
