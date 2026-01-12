'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { FaEdit, FaTrash, FaPaperPlane, FaCalendar } from 'react-icons/fa'
import { publishDraftServer, deleteDraftServer } from '@/lib/draft/draftClient'
import { getCategoryLabel } from '@/lib/data/categories'
import type { DraftListing } from '@/lib/data/salesAccess'

// Format relative time helper (no external dependency)
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
  return date.toLocaleDateString()
}

interface DraftCardProps {
  draft: DraftListing
  onDelete: (draftKey: string) => void
  onPublish: (draftKey: string, saleId: string) => void
}

export default function DraftCard({ draft, onDelete, onPublish }: DraftCardProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const title = draft.title || 'Untitled Draft'
  const primaryPhoto = draft.payload?.photos?.[0] || null
  const itemsCount = draft.payload?.items?.length || 0
  const categories = Array.from(
    new Set(
      draft.payload?.items
        ?.map((item) => item.category)
        .filter((cat): cat is string => Boolean(cat)) || []
    )
  ).slice(0, 2)
  const remainingCategories = Math.max(0, (draft.payload?.items?.filter((item) => item.category).length || 0) - 2)

  const dateStart = draft.payload?.formData?.date_start
  const dateEnd = draft.payload?.formData?.date_end
  const dateRange = dateStart
    ? dateEnd && dateEnd !== dateStart
      ? `${new Date(dateStart).toLocaleDateString()} - ${new Date(dateEnd).toLocaleDateString()}`
      : new Date(dateStart).toLocaleDateString()
    : null

  const handleContinue = () => {
    // Set session keys for resume
    sessionStorage.setItem('auth:postLoginRedirect', '/sell/new?resume=review')
    sessionStorage.setItem('draft:returnStep', 'review')
    // Store draft_key so wizard can load the specific draft
    if (draft.draft_key) {
      sessionStorage.setItem('draft:key', draft.draft_key)
    }
    router.push('/sell/new?resume=review')
  }

  const handlePublish = async () => {
    setIsPublishing(true)
    try {
      const result = await publishDraftServer(draft.draft_key)
      if (result.ok && result.data && 'saleId' in result.data) {
        const saleData = result.data as { saleId: string }
        onPublish(draft.draft_key, saleData.saleId)
        // Emit revalidation event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sales:mutated', { detail: { type: 'create', id: saleData.saleId } }))
        }
        toast.success('Draft published successfully!')
        router.push(`/sales/${saleData.saleId}`)
      } else {
        toast.error(result.error || 'Failed to publish draft')
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[DRAFT_CARD] Error publishing:', error)
      }
      toast.error('Failed to publish draft. Please try again.')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteDraftServer(draft.draft_key)
      if (result.ok) {
        onDelete(draft.draft_key)
        toast.success('Draft deleted')
      } else {
        toast.error(result.error || 'Failed to delete draft')
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[DRAFT_CARD] Error deleting:', error)
      }
      toast.error('Failed to delete draft. Please try again.')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const updatedAt = draft.updated_at ? formatRelativeTime(new Date(draft.updated_at)) : 'Recently'

  return (
    <div className="card card-hover group relative">
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center z-10">
          <div className="bg-white rounded-lg p-4 max-w-xs">
            <p className="text-sm font-medium mb-3">Delete this draft?</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                aria-label="Confirm delete"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
                aria-label="Cancel delete"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card-body">
        {/* Thumbnail */}
        {primaryPhoto ? (
          <div
            className="w-full h-32 rounded mb-3 bg-gray-100"
            style={{
              backgroundImage: `url(${primaryPhoto})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : (
          <div className="w-full h-32 rounded mb-3 bg-gray-100 flex items-center justify-center">
            <FaCalendar className="w-8 h-8 text-gray-400" />
          </div>
        )}

        {/* Title */}
        <div className="font-medium mb-1 line-clamp-2" title={title}>
          {title}
        </div>

        {/* Updated timestamp */}
        <div className="text-xs text-gray-500 mb-2">Updated {updatedAt}</div>

        {/* Date range */}
        {dateRange && (
          <div className="text-xs text-gray-600 mb-2 flex items-center gap-1">
            <FaCalendar className="w-3 h-3" />
            {dateRange}
          </div>
        )}

        {/* Chips */}
        <div className="flex flex-wrap gap-1 mb-3">
          {itemsCount > 0 && (
            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">
              {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
            </span>
          )}
          {categories.map((cat) => (
            <span key={cat} className="px-2 py-0.5 bg-blue-100 rounded text-xs text-blue-700">
              {getCategoryLabel(cat)}
            </span>
          ))}
          {remainingCategories > 0 && (
            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">+{remainingCategories}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-2 border-t">
          <button
            onClick={handleContinue}
            className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center justify-center gap-1"
            aria-label={`Continue editing ${title}`}
          >
            <FaEdit className="w-3 h-3" />
            Continue
          </button>
          <button
            onClick={handlePublish}
            disabled={isPublishing}
            className="px-3 py-1.5 border border-green-600 text-green-600 rounded text-sm hover:bg-green-50 disabled:opacity-50 flex items-center gap-1"
            aria-label={`Publish ${title}`}
          >
            <FaPaperPlane className="w-3 h-3" />
            {isPublishing ? '...' : 'Publish'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="px-3 py-1.5 border border-red-600 text-red-600 rounded text-sm hover:bg-red-50 disabled:opacity-50"
            aria-label={`Delete ${title}`}
          >
            <FaTrash className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

