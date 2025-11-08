'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import SalePlaceholder from '@/components/placeholders/SalePlaceholder'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'
import { FaEdit, FaTrash } from 'react-icons/fa'

interface DashboardSaleCardProps {
  sale: Sale
  onDelete?: (saleId: string) => void
}

export default function DashboardSaleCard({ sale, onDelete }: DashboardSaleCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const cover = getSaleCoverUrl(sale)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/sales/${sale.id}/delete`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete sale' }))
        throw new Error(error.error || 'Failed to delete sale')
      }

      // Emit revalidation event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sales:mutated', { detail: { type: 'delete', id: sale.id } }))
      }

      // Call onDelete callback to update parent state
      if (onDelete) {
        onDelete(sale.id)
      }

      setShowDeleteConfirm(false)
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[DASHBOARD_SALE_CARD] Error deleting sale:', error)
      }
      alert(error?.message || 'Failed to delete sale. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <article 
        className="w-full rounded-2xl overflow-hidden shadow-sm border bg-white" 
        data-testid="dashboard-sale-card"
        data-sale-id={sale.id}
      >
        <div className="relative bg-gray-100 h-40 sm:h-44 md:h-[160px] overflow-hidden">
          {cover ? (
            <Image
              src={cover.url}
              alt={cover.alt}
              fill
              sizes="(min-width:1024px) 33vw, 100vw"
              className="object-cover transform-gpu scale-[1.3]"
              priority={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-6 md:p-8">
              <SalePlaceholder className="max-w-[100%] max-h-[100%] w-auto h-auto opacity-90 scale-[1.69]" />
            </div>
          )}
        </div>

        <div className="p-3 md:p-4 flex flex-col gap-1">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {sale.status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    sale.status === 'published' ? 'bg-green-100 text-green-800' :
                    sale.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {sale.status}
                  </span>
                )}
              </div>
              <h3 className="text-base font-semibold line-clamp-1">{sale.title || `Sale ${sale.id}`}</h3>
            </div>
          </div>
          {sale.description && <p className="text-xs text-neutral-600 line-clamp-1">{sale.description}</p>}
          <div className="text-sm text-neutral-700">
            {sale.address && <div>{sale.address}</div>}
            {sale.city && sale.state && <div>{sale.city}, {sale.state}</div>}
          </div>
          {sale.date_start && (
            <div className="text-xs text-neutral-600">
              {new Date(`${sale.date_start}T${sale.time_start || '00:00'}`).toLocaleString()}
            </div>
          )}
          
          {/* Actions */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
            <Link 
              href={`/sales/${sale.id}`}
              className="flex-1 text-center px-3 py-1.5 text-sm text-[#3A2268] hover:bg-gray-50 rounded transition-colors"
            >
              View
            </Link>
            <Link 
              href={`/sell/${sale.id}/edit`}
              className="flex items-center justify-center gap-1 px-3 py-1.5 text-sm text-[#3A2268] hover:bg-gray-50 rounded transition-colors"
              aria-label="Edit sale"
            >
              <FaEdit className="w-3 h-3" />
              Edit
            </Link>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="flex items-center justify-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Delete sale"
            >
              <FaTrash className="w-3 h-3" />
              Delete
            </button>
          </div>
        </div>
      </article>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Delete Sale</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete &quot;{sale.title}&quot;? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 border rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                aria-label="Cancel delete"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                aria-label="Confirm delete"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

