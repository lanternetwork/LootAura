/**
 * Promotion Processing Page
 * /promotions/processing
 * 
 * Shown after successful payment for draft-based promotions.
 * Explains that the listing will appear shortly (webhook finalization).
 */

'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function ProcessingContent() {
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') || 'draft'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-green-600 text-5xl mb-6">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Payment Successful
          </h1>
          <p className="text-gray-600 mb-2">
            {mode === 'draft' 
              ? 'Your listing is being processed and will appear on the site shortly.'
              : 'Your promotion is being activated and will appear shortly.'}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            This usually takes just a few seconds. You'll receive a confirmation once it's live.
          </p>
          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="block w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Go to Dashboard
            </Link>
            <Link
              href="/"
              className="block w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Browse Listings
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    }>
      <ProcessingContent />
    </Suspense>
  )
}
