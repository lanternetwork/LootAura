'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useCallback } from 'react'

interface ConfirmationModalProps {
  open: boolean
  onClose: () => void
  saleId: string
  onViewSale?: () => void
  // Optional promote CTA (used when a newly created sale is eligible for promotion)
  showPromoteCta?: boolean
  isPromoting?: boolean
  onPromoteNow?: () => void
  promoteDisabledReason?: string | null
}

export default function ConfirmationModal({
  open,
  onClose,
  saleId,
  onViewSale,
  showPromoteCta = false,
  isPromoting = false,
  onPromoteNow,
  promoteDisabledReason,
}: ConfirmationModalProps) {
  const router = useRouter()

  const handleGoToDashboard = useCallback(() => {
    router.push('/dashboard')
    onClose()
  }, [router, onClose])

  // Handle ESC key to close modal
  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleGoToDashboard()
      }
    }

    document.addEventListener('keydown', handleEscape)
    // Lock body scroll when modal is open
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, handleGoToDashboard])

  if (!open) return null

  const handleViewSale = () => {
    if (onViewSale) {
      // Use custom callback if provided - it handles navigation
      // Don't call onClose() here to avoid navigation conflict
      onViewSale()
      // Close modal state without triggering onClose's navigation
      // The parent component should handle closing the modal state
    } else {
      // Default behavior: navigate to sale detail page
      router.push(`/sales/${saleId}`)
      // Close the modal state
      onClose()
    }
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleGoToDashboard()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirmation-title"
          className="text-2xl font-bold text-gray-900 mb-2"
        >
          Sale posted!
        </h2>
        <p className="text-gray-600 mb-4">
          Your sale is live. What next?
        </p>

        {showPromoteCta && (
          <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
            <div className="font-medium text-purple-900 mb-1">Feature your sale</div>
            <p className="text-purple-800">
              Get more visibility by featuring your sale in weekly emails and discovery.
            </p>
            {promoteDisabledReason && (
              <p className="mt-2 text-xs text-purple-900">
                {promoteDisabledReason}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {showPromoteCta && (
            <button
              type="button"
              onClick={onPromoteNow}
              disabled={isPromoting || !onPromoteNow}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors min-h-[44px] disabled:opacity-60 disabled:cursor-not-allowed"
              aria-label="Promote sale now"
              data-testid="confirmation-promote-button"
            >
              {isPromoting ? 'Starting promotion…' : 'Promote now'}
            </button>
          )}
          <button
            onClick={handleViewSale}
            className="flex-1 px-4 py-2 btn-accent min-h-[44px]"
          >
            View Sale
          </button>
          <button
            onClick={handleGoToDashboard}
            className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

