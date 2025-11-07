'use client'

import { FaPlus, FaSync, FaExclamationCircle } from 'react-icons/fa'
import Link from 'next/link'
import DraftCard from './DraftCard'
import type { DraftListing } from '@/lib/data/salesAccess'

interface DraftsPanelProps {
  drafts: DraftListing[]
  isLoading?: boolean
  error?: any
  onDelete: (draftKey: string) => void
  onPublish: (draftKey: string, saleId: string) => void
  onRetry?: () => void
}

export default function DraftsPanel({ drafts, isLoading, error, onDelete, onPublish, onRetry }: DraftsPanelProps) {
  return (
    <div className="card">
      <div className="card-body-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="card-title">Drafts</h2>
            {drafts.length > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                {drafts.length}
              </span>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2">
              <FaExclamationCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 font-medium">Failed to load drafts</p>
                <p className="text-xs text-red-600 mt-1">{error.message || 'An error occurred'}</p>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 flex items-center gap-1"
                    aria-label="Retry loading drafts"
                  >
                    <FaSync className="w-3 h-3" />
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="card-body">
                  <div className="w-full h-32 bg-gray-200 rounded mb-3" />
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                  <div className="flex gap-2">
                    <div className="h-8 bg-gray-200 rounded flex-1" />
                    <div className="h-8 bg-gray-200 rounded w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No drafts yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((draft) => (
              <DraftCard key={draft.id} draft={draft} onDelete={onDelete} onPublish={onPublish} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

