'use client'

/**
 * Client component for promotion checkout
 * Handles Stripe Elements integration and payment confirmation
 */

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getCsrfHeaders } from '@/lib/csrf-client'

// Initialize Stripe (only once)
let stripePromise: Promise<any> | null = null

function getStripePromise(): Promise<any> | null {
  if (stripePromise) {
    return stripePromise
  }
  
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    return null
  }
  
  stripePromise = loadStripe(publishableKey)
  return stripePromise
}

interface PaymentFormProps {
  clientSecret: string
  amountCents: number
  mode: 'draft' | 'sale'
  onSuccess: () => void
  onError: (error: string) => void
}

function PaymentForm({ clientSecret, amountCents, mode: _mode, onSuccess, onError: _onError }: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountDollars = (amountCents / 100).toFixed(2)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      setError('Stripe is not loaded. Please refresh the page.')
      return
    }

    setIsProcessing(true)
    setError(null)

    const cardElement = elements.getElement(CardElement)
    if (!cardElement) {
      setError('Card element not found. Please refresh the page.')
      setIsProcessing(false)
      return
    }

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        redirect: 'if_required',
      })

      if (confirmError) {
        setError(confirmError.message || 'Payment failed. Please try again.')
        setIsProcessing(false)
        return
      }

      if (paymentIntent?.status === 'succeeded') {
        // Payment succeeded - webhook will finalize
        onSuccess()
      } else {
        setError('Payment status is unexpected. Please contact support.')
        setIsProcessing(false)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      setIsProcessing(false)
    }
  }

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#9e2146',
      },
    },
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Price Display */}
      <div className="text-center">
        <div className="text-3xl font-bold text-gray-900">${amountDollars}</div>
        <div className="text-sm text-gray-600 mt-1">Featured Week Promotion</div>
      </div>

      {/* Card Element */}
      <div className="border border-gray-300 rounded-lg p-4 bg-white">
        <CardElement options={cardElementOptions} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] text-lg"
      >
        {isProcessing ? (
          <span className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            Processing...
          </span>
        ) : (
          `Pay $${amountDollars}`
        )}
      </button>

      {/* Info Text */}
      <p className="text-xs text-gray-500 text-center">
        Your payment is secure and will be processed by Stripe. Your listing will be activated shortly after payment confirmation.
      </p>
    </form>
  )
}

export default function PromotionCheckoutClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [amountCents, setAmountCents] = useState<number | null>(null)
  const [mode, setMode] = useState<'draft' | 'sale'>('draft')
  
  // Check for Stripe publishable key on mount
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(
    !publishableKey ? 'Payment processing is not configured. Please contact support.' : null
  )
  const [success, setSuccess] = useState(false)

  // Get parameters from URL
  const draftKey = searchParams.get('draft_key')
  const saleId = searchParams.get('sale_id')
  const promotionId = searchParams.get('promotion_id')
  const urlMode = searchParams.get('mode') as 'draft' | 'sale' | null

  useEffect(() => {
    // Check for Stripe publishable key first
    if (!publishableKey) {
      setLoading(false)
      return
    }

    // Determine mode from URL params
    const detectedMode = urlMode || (draftKey ? 'draft' : saleId ? 'sale' : null)
    
    if (!detectedMode) {
      setError('Missing required parameters. Please provide draft_key or sale_id.')
      setLoading(false)
      return
    }

    setMode(detectedMode)

    // Fetch client secret from API
    const fetchClientSecret = async () => {
      try {
        const requestBody: any = {
          mode: detectedMode,
          tier: 'featured_week',
        }

        if (detectedMode === 'draft') {
          if (!draftKey) {
            setError('draft_key is required for draft mode')
            setLoading(false)
            return
          }
          requestBody.draft_key = draftKey
        } else {
          if (!saleId) {
            setError('sale_id is required for sale mode')
            setLoading(false)
            return
          }
          requestBody.sale_id = saleId
          if (promotionId) {
            requestBody.promotion_id = promotionId
          }
        }

        const response = await fetch('/api/promotions/intent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getCsrfHeaders(),
          },
          credentials: 'include',
          body: JSON.stringify(requestBody),
        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          const errorMessage = data.error || data.message || 'Failed to initialize payment'
          setError(errorMessage)
          setLoading(false)
          return
        }

        if (!data.clientSecret) {
          setError('Invalid response from server')
          setLoading(false)
          return
        }

        setClientSecret(data.clientSecret)

        // Fetch amount for display
        try {
          const amountResponse = await fetch('/api/promotions/amount?tier=featured_week')
          const amountData = await amountResponse.json()
          if (amountData.amountCents) {
            setAmountCents(amountData.amountCents)
          } else {
            // Fallback to default
            setAmountCents(299)
          }
        } catch {
          // Fallback to default
          setAmountCents(299)
        }

        setLoading(false)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize payment'
        setError(errorMessage)
        setLoading(false)
      }
    }

    fetchClientSecret()
  }, [draftKey, saleId, promotionId, urlMode])

  const handleSuccess = () => {
    setSuccess(true)
    
    // Navigate after a short delay
    setTimeout(() => {
      if (mode === 'draft') {
        // Navigate to processing page
        router.push('/promotions/processing?mode=draft')
      } else {
        // Navigate to dashboard with success message
        router.push('/dashboard?promotion=success')
      }
    }, 2000)
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading payment form...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error && !clientSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center">
              <div className="text-red-600 text-4xl mb-4">✕</div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Payment Setup Failed</h1>
              <p className="text-gray-600 mb-6">{error}</p>
              <button
                onClick={() => router.back()}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center">
              <div className="text-green-600 text-4xl mb-4">✓</div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Payment Successful</h1>
              <p className="text-gray-600">
                {mode === 'draft' 
                  ? 'Your listing is being processed and will appear shortly.'
                  : 'Your promotion is being activated and will appear shortly.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Payment form
  if (!clientSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center">
              <p className="text-gray-600">Unable to initialize payment. Please try again.</p>
              <button
                onClick={() => router.back()}
                className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Initialize Stripe Elements
  const stripePromise = getStripePromise()
  if (!stripePromise) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center">
              <div className="text-red-600 text-4xl mb-4">✕</div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Payment Setup Failed</h1>
              <p className="text-gray-600 mb-6">Payment processing is not configured. Please contact support.</p>
              <button
                onClick={() => router.back()}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const amount = amountCents || 299
  const elementsOptions: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
    },
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Complete Your Payment
          </h1>
          
          <Elements stripe={stripePromise} options={elementsOptions}>
            <PaymentForm
              clientSecret={clientSecret}
              amountCents={amount}
              mode={mode}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          </Elements>
        </div>
      </div>
    </div>
  )
}
