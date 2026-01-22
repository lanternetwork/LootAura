'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import SalePlaceholder from '@/components/placeholders/SalePlaceholder'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'
import { FaEdit, FaTrash } from 'react-icons/fa'
import AddressLink from '@/components/common/AddressLink'
import { getCsrfHeaders } from '@/lib/csrf-client'

interface DashboardSaleCardProps {
  sale: Sale
  onDelete?: (saleId: string) => void
  promotionsEnabled?: boolean
  paymentsEnabled?: boolean
  promotionStatus?: {
    sale_id: string
    is_active: boolean
    ends_at: string | null
    tier: string | null
  }
  isPromotionLoading?: boolean
}

export default function DashboardSaleCard({
  sale,
  onDelete,
  promotionsEnabled = false,
  paymentsEnabled = false,
  promotionStatus,
  isPromotionLoading = false,
}: DashboardSaleCardProps) {
  const router = useRouter()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const cover = getSaleCoverUrl(sale)

  const isPromotionActive = promotionStatus?.is_active && !!promotionStatus.ends_at

  const formatPromotionEndDate = (endsAt: string | null) => {
    if (!endsAt) return ''
    const date = new Date(endsAt)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const handlePromote = () => {
    if (!promotionsEnabled) {
      return
    }

    if (!paymentsEnabled) {
      toast.info('Promotions are not available right now. Please check back later.')
      return
    }

    if (isPromotionLoading) {
      return
    }

    // Navigate directly to internal checkout page
    // /api/promotions/intent will handle validation and create promotion record if needed
    const checkoutUrl = `/promotions/checkout?mode=sale&sale_id=${encodeURIComponent(sale.id)}&tier=featured_week`
    
    // Prefetch checkout route to warm code chunks
    router.prefetch(checkoutUrl)
    
    router.push(checkoutUrl)
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    
    // Optimistic update: remove from UI immediately
    if (onDelete) {
      onDelete(sale.id)
    }
    
    // Emit revalidation event immediately for other components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sales:mutated', { detail: { type: 'delete', id: sale.id } }))
    }
    
    setShowDeleteConfirm(false)
    
    try {
      const response = await fetch(`/api/sales/${sale.id}/delete`, {
        method: 'DELETE',
        headers: {
          ...getCsrfHeaders(),
        },
        credentials: 'include',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete sale' }))
        // Revert optimistic update on error
        if (onDelete) {
          // Re-add the sale (would need to pass sale object, but for now just show error)
          throw new Error(error.error || 'Failed to delete sale')
        }
        throw new Error(error.error || 'Failed to delete sale')
      }

      // Success - sale is already removed from UI via optimistic update
      toast.success('Sale deleted successfully')
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[DASHBOARD_SALE_CARD] Error deleting sale:', error)
      }
      // Show error toast
      toast.error(error?.message || 'Failed to delete sale. Please refresh the page.')
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
            {sale.address && (
              <div>
                <AddressLink
                  lat={sale.lat ?? undefined}
                  lng={sale.lng ?? undefined}
                  address={sale.address && sale.city && sale.state 
                    ? `${sale.address}, ${sale.city}, ${sale.state}`
                    : sale.address
                  }
                >
                  {sale.address}
                </AddressLink>
              </div>
            )}
            {sale.city && sale.state && (
              <div>
                <AddressLink
                  lat={sale.lat ?? undefined}
                  lng={sale.lng ?? undefined}
                  address={sale.address && sale.city && sale.state 
                    ? `${sale.address}, ${sale.city}, ${sale.state}`
                    : `${sale.city}, ${sale.state}`
                  }
                >
                  {sale.city}, {sale.state}
                </AddressLink>
              </div>
            )}
          </div>
          {sale.date_start && (
            <div className="text-xs text-neutral-600">
              {sale.date_end && sale.date_end !== sale.date_start ? (
                // Multi-day sale: show date range
                `${new Date(sale.date_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(sale.date_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              ) : (
                // Single-day sale: show date and time
                new Date(`${sale.date_start}T${sale.time_start || '00:00'}`).toLocaleString()
              )}
            </div>
          )}
          
          {/* Promotion Status Badge (compact) */}
          {promotionsEnabled && isPromotionActive && (
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                Promoted
              </span>
              {promotionStatus?.ends_at && (
                <span className="text-xs text-neutral-500">
                  Ends {formatPromotionEndDate(promotionStatus.ends_at)}
                </span>
              )}
            </div>
          )}
          
          {/* Actions */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 mt-2 pt-2 border-t border-gray-200">
            <Link 
              href={`/sales/${sale.id}`}
              className="flex-1 text-center px-2 sm:px-3 py-1.5 text-sm text-[#3A2268] hover:bg-gray-50 rounded transition-colors min-w-0 flex-shrink-0"
            >
              View
            </Link>
            <Link 
              href={`/sell/${sale.id}/edit`}
              className="flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 text-sm text-[#3A2268] hover:bg-gray-50 rounded transition-colors flex-shrink-0"
              aria-label="Edit sale"
            >
              <FaEdit className="w-3 h-3" />
              Edit
            </Link>
            {promotionsEnabled && (
              <button
                type="button"
                onClick={isPromotionActive ? undefined : handlePromote}
                disabled={
                  isPromotionLoading || isPromotionActive || !paymentsEnabled
                }
                className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 text-sm rounded transition-colors flex-shrink-0 ${
                  isPromotionActive
                    ? 'text-green-700 bg-green-50 cursor-default'
                    : paymentsEnabled
                      ? 'text-blue-600 hover:bg-blue-50'
                      : 'text-gray-400 bg-gray-50 cursor-not-allowed'
                } disabled:opacity-60`}
                aria-label={isPromotionActive ? 'Sale is promoted' : 'Promote sale'}
                data-testid="dashboard-promote-button"
              >
                {isPromotionActive
                  ? 'Promoted'
                  : isPromotionLoading
                    ? 'Promoting...'
                    : paymentsEnabled
                      ? 'Promote'
                      : 'Promotions unavailable'}
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
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

