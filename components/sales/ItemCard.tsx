'use client'

import { getCategoryLabel, getCategoryIcon } from '@/lib/data/categories'
import type { CategoryValue } from '@/lib/types'

interface ItemCardProps {
  item: {
    id: string
    name: string
    price?: number
    description?: string
    image_url?: string
    category?: CategoryValue | string // Allow string for backward compatibility
  }
  onDelete?: () => void
  onEdit?: () => void
  isUploading?: boolean
}

export default function ItemCard({
  item,
  onDelete,
  onEdit,
  isUploading = false
}: ItemCardProps) {
  const formatPrice = (price?: number) => {
    if (price === undefined || price === null) return 'Price negotiable'
    return `$${price.toFixed(2)}`
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              className="w-20 h-20 object-cover rounded-lg border border-gray-200"
            />
          ) : (
            <div className="w-20 h-20 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 truncate">{item.name}</h4>
              <p className="text-sm text-gray-600 mt-1">{formatPrice(item.price)}</p>
              {item.category && (() => {
                const categoryIcon = getCategoryIcon(item.category)
                const categoryLabel = getCategoryLabel(item.category)
                return (
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                    {categoryIcon && <span>{categoryIcon}</span>}
                    <span>{categoryLabel}</span>
                  </span>
                )
              })()}
            </div>
            
            {/* Actions */}
            {(onDelete || onEdit) && (
              <div className="flex gap-1 flex-shrink-0">
                {onEdit && (
                  <button
                    onClick={onEdit}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    aria-label="Edit item"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    aria-label="Delete item"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
          
          {item.description && (
            <p className="text-sm text-gray-500 mt-2 overflow-hidden text-ellipsis" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.description}</p>
          )}
        </div>
      </div>
    </div>
  )
}

