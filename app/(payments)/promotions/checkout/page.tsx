/**
 * Promotion Checkout Page
 * /promotions/checkout
 * 
 * Displays Stripe Elements payment form for promotion purchases.
 * Supports both draft-based (new sale) and existing sale promotion flows.
 */

import { Suspense } from 'react'
import PromotionCheckoutClient from './PromotionCheckoutClient'

export const dynamic = 'force-dynamic'

export default function PromotionCheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    }>
      <PromotionCheckoutClient />
    </Suspense>
  )
}
