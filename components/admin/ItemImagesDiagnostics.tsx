'use client'

import { useState, useEffect } from 'react'

interface ItemImageDiagnostic {
  id: string
  sale_id: string
  name: string
  image_url?: string | null
  images?: string[] | null
  images_type: string
  images_length: number
  first_image_url?: string | null
  has_image_url: boolean
  has_images_array: boolean
  raw_data: any
}

interface DiagnosticResult {
  total_items: number
  items_with_images: number
  items_with_image_url: number
  items_with_images_array: number
  items_with_both: number
  items_with_neither: number
  sample_items: ItemImageDiagnostic[]
  errors: string[]
}

export default function ItemImagesDiagnostics() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiagnosticResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchDiagnostics = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/admin/items/diagnostics')
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.error || `HTTP ${response.status}`
        const errorDetails = errorData.details ? `: ${errorData.details}` : ''
        throw new Error(`${errorMessage}${errorDetails}`)
      }

      const data = await response.json()
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch item diagnostics')
      console.error('[ItemImagesDiagnostics] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Auto-fetch on mount
    fetchDiagnostics()
  }, [])


  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Item Images Diagnostics</h3>
        <button
          onClick={fetchDiagnostics}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary Statistics */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-2xl font-bold text-gray-900">{result.total_items}</div>
                <div className="text-sm text-gray-600">Total Items</div>
              </div>
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-2xl font-bold text-blue-900">{result.items_with_images_array}</div>
                <div className="text-sm text-blue-600">With images[]</div>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <div className="text-2xl font-bold text-green-900">{result.items_with_image_url}</div>
                <div className="text-sm text-green-600">With image_url</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded">
                <div className="text-2xl font-bold text-yellow-900">{result.items_with_neither}</div>
                <div className="text-sm text-yellow-600">No Images</div>
              </div>
            </div>
          </div>

          {/* Sample Items */}
          {result.sample_items.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Sample Items (showing up to 10)</h4>
              <div className="space-y-3">
                {result.sample_items.map((item) => (
                  <div
                    key={item.id}
                    className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-500 mt-1">ID: {item.id}</div>
                        <div className="text-xs text-gray-500">Sale ID: {item.sale_id}</div>
                      </div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div className={item.has_images_array ? 'text-green-600' : 'text-gray-400'}>
                          ✓ images[]: {item.has_images_array ? 'Yes' : 'No'} ({item.images_length} items)
                        </div>
                        <div className={item.has_image_url ? 'text-green-600' : 'text-gray-400'}>
                          ✓ image_url: {item.has_image_url ? 'Yes' : 'No'}
                        </div>
                      </div>
                    </div>

                    {/* Image Display */}
                    <div className="mt-3 space-y-2">
                      {item.first_image_url && (
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-1">
                            First Image URL:
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <div className="text-xs text-gray-600 break-all bg-white p-2 rounded border">
                                {item.first_image_url}
                              </div>
                            </div>
                            <div className="w-24 h-24 border border-gray-300 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                              <img
                                src={item.first_image_url}
                                alt={item.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                  const parent = target.parentElement
                                  if (parent) {
                                    parent.innerHTML = '<div class="w-full h-full flex items-center justify-center text-xs text-red-600">Failed to load</div>'
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {item.images && item.images.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-1">
                            All Images ({item.images.length}):
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {item.images.map((imgUrl, idx) => (
                              <div key={idx} className="relative">
                                <img
                                  src={imgUrl}
                                  alt={`${item.name} - Image ${idx + 1}`}
                                  className="w-full h-20 object-cover rounded border border-gray-300"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                    const parent = target.parentElement
                                    if (parent) {
                                      parent.innerHTML = '<div class="w-full h-20 flex items-center justify-center text-xs text-red-600 bg-red-50 rounded border">Failed</div>'
                                    }
                                  }}
                                />
                                <div className="text-xs text-gray-500 mt-1 truncate" title={imgUrl}>
                                  {imgUrl.substring(0, 30)}...
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!item.first_image_url && (
                        <div className="text-xs text-gray-500 italic">No images available</div>
                      )}
                    </div>

                    {/* Raw Data (Collapsible) */}
                    <details className="mt-3">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                        View Raw Data
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-800 text-green-400 p-2 rounded overflow-auto max-h-40">
                        {JSON.stringify(item.raw_data, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <div>
              <h4 className="font-medium text-red-900 mb-2">Errors</h4>
              <div className="space-y-1">
                {result.errors.map((err, idx) => (
                  <div key={idx} className="text-sm text-red-700 bg-red-50 p-2 rounded">
                    {err}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !loading && !error && (
        <div className="text-sm text-gray-500">Click "Refresh" to load diagnostics</div>
      )}
    </div>
  )
}

