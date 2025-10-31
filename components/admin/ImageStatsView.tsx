'use client'

import { useState, useEffect } from 'react'

interface ImageStats {
  total: number
  withCoverImage: number
  withImages: number
  usingPlaceholder: number
  placeholderPercentage: number
}

interface SaleImage {
  id: string
  title: string
  cover_image_url: string | null
  images: string[] | null
  created_at: string
}

interface ImageStatsResponse {
  ok: boolean
  stats?: ImageStats
  sales?: SaleImage[]
  error?: string
  message?: string
}

export default function ImageStatsView() {
  const [stats, setStats] = useState<ImageStats | null>(null)
  const [sales, setSales] = useState<SaleImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchImageStats()
  }, [])

  const fetchImageStats = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/images-stats')
      const data: ImageStatsResponse = await response.json()

      if (!data.ok || !data.stats || !data.sales) {
        throw new Error(data.error || data.message || 'Failed to fetch image stats')
      }

      setStats(data.stats)
      setSales(data.sales)
    } catch (err: any) {
      setError(err.message || 'Failed to load image statistics')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Image Statistics</h3>
        <button
          onClick={fetchImageStats}
          disabled={isLoading}
          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {isLoading && !stats && (
        <div className="text-center py-8">
          <p className="text-gray-500">Loading image statistics...</p>
        </div>
      )}

      {stats && (
        <>
          {/* Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-900">{stats.total}</div>
              <div className="text-sm text-blue-700">Total Sales</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-900">{stats.withCoverImage}</div>
              <div className="text-sm text-green-700">With Cover Image</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-900">{stats.withImages}</div>
              <div className="text-sm text-purple-700">With Images Array</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">
                {stats.usingPlaceholder} ({stats.placeholderPercentage}%)
              </div>
              <div className="text-sm text-gray-700">Using Placeholder</div>
            </div>
          </div>

          {/* Last 10 Sales */}
          <div className="mt-6">
            <h4 className="text-md font-semibold mb-3">Last 10 Sales</h4>
            <div className="space-y-3">
              {sales.length === 0 ? (
                <p className="text-gray-500 text-sm">No sales found</p>
              ) : (
                sales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-start space-x-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-shrink-0">
                      {sale.cover_image_url ? (
                        <img
                          src={sale.cover_image_url}
                          alt={sale.title}
                          className="w-16 h-16 object-cover rounded-md"
                          onError={(e) => {
                            // Fallback to placeholder if image fails to load
                            e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"%3E%3Crect fill="%23e5e7eb" width="64" height="64"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E'
                          }}
                        />
                      ) : (
                        <div className="w-16 h-16 bg-gray-200 rounded-md flex items-center justify-center">
                          <span className="text-xs text-gray-500">Placeholder</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h5 className="text-sm font-medium text-gray-900 truncate">
                          {sale.title}
                        </h5>
                        {sale.cover_image_url && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                            Cover
                          </span>
                        )}
                        {sale.images && Array.isArray(sale.images) && sale.images.length > 0 && (
                          <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                            {sale.images.length} photo{sale.images.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {!sale.cover_image_url && (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-800 rounded">
                            Placeholder
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        ID: {sale.id} • Created: {formatDate(sale.created_at)}
                      </p>
                      {sale.cover_image_url && (
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          {sale.cover_image_url}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

