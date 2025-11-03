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

  const currentListings = tab === 'active' ? active : tab === 'drafts' ? drafts : archived

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
                      <button type="button" onClick={() => onArchive(listing.id)} className="text-sm text-neutral-600 hover:text-neutral-900">
                        Archive
                      </button>
                    )}
                    {tab === 'archived' && onUnarchive && (
                      <button type="button" onClick={() => onUnarchive(listing.id)} className="text-sm text-neutral-600 hover:text-neutral-900">
                        Unarchive
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => onDelete(listing.id)} className="text-sm text-red-600 hover:text-red-700">
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
    </div>
  )
}

