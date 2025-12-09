'use client'

import { useState, useEffect, useRef } from 'react'
import { getCsrfHeaders } from '@/lib/csrf-client'
import { toast } from 'react-toastify'

interface ReportSaleModalProps {
  saleId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const REPORT_REASONS = [
  { value: 'fraud', label: 'Fraud / scam' },
  { value: 'prohibited_items', label: 'Prohibited or inappropriate content' },
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
] as const

export default function ReportSaleModal({
  saleId,
  open,
  onOpenChange,
}: ReportSaleModalProps) {
  const [reason, setReason] = useState<string>('')
  const [details, setDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const reasonSelectRef = useRef<HTMLSelectElement>(null)
  const detailsTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setReason('')
      setDetails('')
      setIsSubmitting(false)
      // Focus reason select after a short delay to ensure modal is rendered
      setTimeout(() => {
        reasonSelectRef.current?.focus()
      }, 100)
    }
  }, [open])

  // Handle ESC key to close modal
  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onOpenChange(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    // Lock body scroll when modal is open
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, isSubmitting, onOpenChange])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!reason) {
      toast.error('Please select a reason for reporting this sale')
      reasonSelectRef.current?.focus()
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/sales/${saleId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({
          reason,
          details: details.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to submit report' }))
        throw new Error(errorData.error || 'Failed to submit report')
      }

      toast.success("Thanks, we've received your report.")
      onOpenChange(false)
    } catch (error: any) {
      console.error('Failed to submit report:', error)
      toast.error("We couldn't submit your report. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onOpenChange(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-sale-title"
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="report-sale-title"
          className="text-2xl font-bold text-gray-900 mb-4"
        >
          Report this sale
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="report-reason"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Reason <span className="text-red-500">*</span>
            </label>
            <select
              id="report-reason"
              ref={reasonSelectRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Select a reason...</option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-details"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Additional details <span className="text-gray-500 text-xs">(optional)</span>
            </label>
            <textarea
              id="report-details"
              ref={detailsTextareaRef}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              disabled={isSubmitting}
              rows={4}
              maxLength={500}
              placeholder="Provide any additional information that might help us review this report..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
            />
            <div className="mt-1 text-xs text-gray-500 text-right">
              {details.length}/500
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !reason}
              className="flex-1 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px]"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

