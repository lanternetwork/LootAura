'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import DraftCard from './DraftCard'
import type { DraftListing } from '@/lib/data/salesAccess'

interface DraftsPanelProps {
  drafts: DraftListing[]
  isLoading?: boolean
  onDelete: (draftKey: string) => void
  onPublish: (draftKey: string, saleId: string) => void
}

export default function DraftsPanel({ drafts, isLoading, onDelete, onPublish }: DraftsPanelProps) {
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
          <Link
            href="/sell/new"
            className="btn-accent flex items-center gap-1 text-sm"
            aria-label="Create new sale"
          >
            <Plus className="w-4 h-4" />
            Create New Sale
          </Link>
        </div>

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
            <p className="text-gray-600 mb-4">No drafts yet. Start a new sale.</p>
            <Link href="/sell/new" className="btn-accent inline-flex items-center gap-1">
              <Plus className="w-4 h-4" />
              Start a new sale
            </Link>
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

