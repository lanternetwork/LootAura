'use client'

import { useRouter } from 'next/navigation'

interface ConfirmationModalProps {
  open: boolean
  onClose: () => void
  saleId: string
  onViewSale?: () => void
}

export default function ConfirmationModal({
  open,
  onClose,
  saleId,
  onViewSale
}: ConfirmationModalProps) {
  const router = useRouter()

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

  const handleGoToDashboard = () => {
    router.push('/dashboard')
    onClose()
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
        <p className="text-gray-600 mb-6">
          Your sale is live. What next?
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
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

