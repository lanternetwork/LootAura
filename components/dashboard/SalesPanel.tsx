'use client'

import { FaPlus } from 'react-icons/fa'
import Link from 'next/link'
import SaleCard from '@/components/SaleCard'
import { Sale } from '@/lib/types'

interface SalesPanelProps {
  sales: Sale[]
}

export default function SalesPanel({ sales }: SalesPanelProps) {
  return (
    <div className="card">
      <div className="card-body-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="card-title">Your Sales</h2>
            {sales.length > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                {sales.length}
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
        {sales.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No sales yet. Create your first sale.</p>
            <Link href="/sell/new" className="btn-accent inline-flex items-center gap-1">
              <FaPlus className="w-4 h-4" />
              Create New Sale
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sales.map((sale) => {
              // Debug: log image data
              if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                console.log('[SALES_PANEL] Sale image data:', {
                  id: sale.id,
                  title: sale.title,
                  cover_image_url: sale.cover_image_url,
                  images: sale.images,
                  imagesLength: sale.images?.length,
                })
              }
              return <SaleCard key={sale.id} sale={sale} />
            })}
          </div>
        )}
      </div>
    </div>
  )
}

