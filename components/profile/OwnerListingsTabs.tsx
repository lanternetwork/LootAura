'use client'

import { useState } from 'react'
import Link from 'next/link'

type Listing = {
  id: string
  title: string
  cover_url?: string | null
  address?: string | null
  status: string
}

type OwnerListingsTabsProps = {
  active?: Listing[]
  drafts?: Listing[]
  archived?: Listing[]
  onEdit?: (id: string) => void
  onArchive?: (id: string) => void
  onUnarchive?: (id: string) => void
  onDelete?: (id: string) => void
}

export function OwnerListingsTabs({
  active = [],
  drafts = [],
  archived = [],
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
}: OwnerListingsTabsProps) {
  const [tab, setTab] = useState<'active' | 'drafts' | 'archived'>('active')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const currentListings = tab === 'active' ? active : tab === 'drafts' ? drafts : archived
  
  const handleDeleteClick = (id: string) => {
    setDeleteConfirmId(id)
  }
  
  const handleDeleteConfirm = () => {
    if (deleteConfirmId && onDelete) {
      onDelete(deleteConfirmId)
      // Emit cache revalidation event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sales:mutated', { detail: { type: 'delete', id: deleteConfirmId } }))
      }
      setDeleteConfirmId(null)
    }
  }
  
  const handleArchive = (id: string) => {
    if (onArchive) {
      onArchive(id)
      // Emit cache revalidation event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sales:mutated', { detail: { type: 'archive', id } }))
      }
    }
  }
  
  const handleUnarchive = (id: string) => {
    if (onUnarchive) {
      onUnarchive(id)
      // Emit cache revalidation event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sales:mutated', { detail: { type: 'unarchive', id } }))
      }
    }
  }

  return (
    <div className="card">
      <div className="card-body-lg">
        <div className="flex gap-2 mb-4 border-b border-neutral-200">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] ${
              tab === 'active' ? 'border-accent-primary text-accent-primary' : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Active ({active.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('drafts')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] ${
              tab === 'drafts' ? 'border-accent-primary text-accent-primary' : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Drafts ({drafts.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('archived')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] ${
              tab === 'archived' ? 'border-accent-primary text-accent-primary' : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Archived ({archived.length})
          </button>
        </div>

        {currentListings.length === 0 ? (
          <div className="text-neutral-600 text-center py-8">No {tab} listings.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentListings.map((listing) => (
              <div key={listing.id} className="card">
                <div className="card-body">
                  <div
                    className="w-full h-32 rounded mb-2 bg-neutral-200"
                    style={listing.cover_url ? { backgroundImage: `url(${listing.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                  />
                  <div className="font-medium truncate mb-1">{listing.title}</div>
                  {listing.address && <div className="text-sm text-neutral-600 truncate mb-2">{listing.address}</div>}
                  <div className="flex gap-2 flex-wrap">
                    <Link href={`/sales/${listing.id}`} className="link-accent text-sm">
                      View
                    </Link>
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(listing.id)} className="link-accent text-sm">
                        Edit
                      </button>
                    )}
                    {tab === 'active' && onArchive && (
                      <button type="button" onClick={() => handleArchive(listing.id)} className="text-sm text-neutral-600 hover:text-neutral-900">
                        Archive
                      </button>
                    )}
                    {tab === 'archived' && onUnarchive && (
                      <button type="button" onClick={() => handleUnarchive(listing.id)} className="text-sm text-neutral-600 hover:text-neutral-900">
                        Unarchive
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => handleDeleteClick(listing.id)} className="text-sm text-red-600 hover:text-red-700">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-lg p-6 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-4">Delete Listing</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Are you sure you want to delete this listing? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded px-4 py-2 border text-sm hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="btn-accent text-sm bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

