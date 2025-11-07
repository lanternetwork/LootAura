'use client'

import { FaPlus } from 'react-icons/fa'
import Link from 'next/link'

type Listing = { 
  id: string
  title: string
  updated_at?: string | null
  status?: string | null
  cover_image_url?: string | null
  cover_url?: string | null
}

interface SalesPanelProps {
  listings: Listing[]
}

export default function SalesPanel({ listings }: SalesPanelProps) {
  return (
    <div className="card">
      <div className="card-body-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="card-title">Your Sales</h2>
            {listings.length > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                {listings.length}
              </span>
            )}
          </div>
          <Link
            href="/sell/new"
            className="btn-accent flex items-center gap-1 text-sm"
            aria-label="Create new sale"
          >
            <FaPlus className="w-4 h-4" />
            Create New Sale
          </Link>
        </div>

        {/* Body */}
        {listings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No sales yet. Create your first sale.</p>
            <Link href="/sell/new" className="btn-accent inline-flex items-center gap-1">
              <FaPlus className="w-4 h-4" />
              Create New Sale
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((l) => (
              <div key={l.id} className="card card-hover">
                <div className="card-body">
                  {(l.cover_url || l.cover_image_url) ? (
                    <div 
                      className="w-full h-32 rounded mb-3" 
                      style={{ 
                        backgroundImage: `url(${l.cover_url || l.cover_image_url})`, 
                        backgroundSize: 'cover', 
                        backgroundPosition: 'center' 
                      }} 
                    />
                  ) : null}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{l.title}</div>
                      <div className="text-xs text-gray-500">
                        {l.updated_at ? new Date(l.updated_at).toLocaleString() : ''}
                      </div>
                    </div>
                    <a href={`/sales/${l.id}`} className="link-accent text-sm">Edit</a>
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

