'use client'

/**
 * Client component for promotion checkout
 * Handles Stripe Elements integration and payment confirmation
 */

import { useEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getCsrfHeaders } from '@/lib/csrf-client'
import { getDraftByKeyServer } from '@/lib/draft/draftClient'
import Image from 'next/image'

// Initialize Stripe (only once) - singleton pattern
let stripePromise: Promise<any> | null = null
let stripeInstance: any = null

function getStripePromise(): Promise<any> | null {
  if (stripeInstance) {
    return Promise.resolve(stripeInstance)
  }
  
  if (stripePromise) {
    return stripePromise
  }
  
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    return null
  }
  
  // Mark Stripe initialization start
  if (typeof performance !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG === 'true') {
    performance.mark('stripe-init-start')
  }
  
  stripePromise = loadStripe(publishableKey).then((stripe) => {
    stripeInstance = stripe
    if (typeof performance !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      performance.mark('stripe-init-end')
      performance.measure('stripe-init', 'stripe-init-start', 'stripe-init-end')
    }
    return stripe
  })
  
  return stripePromise
}

interface PaymentFormProps {
  clientSecret: string
  amountCents: number
  mode: 'draft' | 'sale'
  onSuccess: () => void
  onError: (error: string) => void
}

function PaymentForm({ clientSecret, amountCents, mode: _mode, onSuccess, onError }: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false)
  const hasLoggedReadyRef = useRef(false)

  const amountDollars = (amountCents / 100).toFixed(2)
  
  // Memoize PaymentElement options to prevent recreation on every render
  const paymentElementOptions = useMemo(() => ({
    layout: 'tabs' as const,
    fields: {
      billingDetails: {
        email: 'never' as const,
        phone: 'never' as const,
        address: {
          country: 'never' as const,
          line1: 'never' as const,
          line2: 'never' as const,
          city: 'never' as const,
          state: 'never' as const,
          postalCode: 'never' as const,
        },
      },
    },
    onReady: () => {
      setIsPaymentElementReady(true)
      if (typeof performance !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG === 'true' && !hasLoggedReadyRef.current) {
        performance.mark('payment-element-ready')
        hasLoggedReadyRef.current = true
        // Measure from component mount to ready
        if (typeof window !== 'undefined' && (window as any).__checkoutMountTime) {
          performance.measure('payment-element-load', '__checkout-mount', 'payment-element-ready')
        }
      }
    },
  }), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      setError('Stripe is not loaded. Please refresh the page.')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        redirect: 'if_required',
      })

      if (confirmError) {
        setError(confirmError.message || 'Payment failed. Please try again.')
        setIsProcessing(false)
        onError(confirmError.message || 'Payment failed')
        return
      }

      if (paymentIntent?.status === 'succeeded') {
        // Payment succeeded - webhook will finalize
        onSuccess()
      } else {
        setError('Payment status is unexpected. Please contact support.')
        setIsProcessing(false)
        onError('Payment status is unexpected')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      setIsProcessing(false)
      onError(errorMessage)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Total Display */}
      <div className="flex items-baseline justify-between pb-4 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">Total</span>
        <span className="text-2xl font-bold text-gray-900">${amountDollars}</span>
      </div>

      {/* Payment Element */}
      <div className="py-2">
        {!isPaymentElementReady ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-12 bg-gray-200 rounded-lg"></div>
            <div className="h-12 bg-gray-200 rounded-lg"></div>
            <div className="h-8 bg-gray-100 rounded"></div>
          </div>
        ) : (
          <PaymentElement options={paymentElementOptions} />
        )}
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
        className="w-full px-6 py-3.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] text-base shadow-sm"
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
        Your payment is secure and will be processed by Stripe.
      </p>
    </form>
  )
}

interface CheckoutSummary {
  title: string
  city: string
  state: string
  photoUrl: string | null
  dateStart?: string
  timeStart?: string
}

export default function PromotionCheckoutClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [amountCents, setAmountCents] = useState<number | null>(null)
  const [mode, setMode] = useState<'draft' | 'sale'>('draft')
  const [summary, setSummary] = useState<CheckoutSummary | null>(null)
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error' | 'no-image'>('loading')
  const [debugTimings, setDebugTimings] = useState<Record<string, number | string | boolean>>({})
  const imageLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Check for Stripe publishable key on mount
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(
    !publishableKey ? 'Payment processing is not configured. Please contact support.' : null
  )
  const [success, setSuccess] = useState(false)
  const isDebug = process.env.NEXT_PUBLIC_DEBUG === 'true'
  
  // Mark component mount time for timing instrumentation
  useEffect(() => {
    if (typeof performance !== 'undefined' && isDebug) {
      performance.mark('__checkout-mount')
      if (typeof window !== 'undefined') {
        (window as any).__checkoutMountTime = performance.now()
      }
    }
  }, [isDebug])

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

    // Fetch summary first, then client secret
    const fetchSummaryAndClientSecret = async () => {
      try {
        // Step 1: Fetch checkout summary
        let fetchedSummary: CheckoutSummary | null = null

        if (detectedMode === 'sale') {
          if (!saleId) {
            setError('sale_id is required for sale mode')
            setLoading(false)
            return
          }

          // Use no-store to prevent stale data after draft edits
          const summaryResponse = await fetch(`/api/sales/${saleId}/summary`, {
            cache: 'no-store',
            credentials: 'include',
          })
          if (!summaryResponse.ok) {
            const errorData = await summaryResponse.json().catch(() => ({}))
            setError(errorData.error || 'Failed to load sale information')
            setLoading(false)
            return
          }

          const summaryData = await summaryResponse.json()
          fetchedSummary = {
            title: summaryData.title || 'Untitled Sale',
            city: summaryData.city || '',
            state: summaryData.state || '',
            photoUrl: summaryData.photoUrl || null,
          }
          
          // Set image state based on whether photoUrl exists
          if (!fetchedSummary.photoUrl) {
            setImageState('no-image')
            fetchedSummary.photoUrl = '/placeholders/sale-placeholder.svg'
          } else {
            setImageState('loading')
            // Set timeout to detect slow-loading images (10 seconds)
            if (imageLoadTimeoutRef.current) {
              clearTimeout(imageLoadTimeoutRef.current)
            }
            imageLoadTimeoutRef.current = setTimeout(() => {
              if (imageState === 'loading') {
                if (isDebug) {
                  setDebugTimings(prev => ({
                    ...prev,
                    imageStillLoadingAfter: 10000,
                  }))
                }
              }
            }, 10000)
          }
          
          if (isDebug && fetchedSummary) {
            // Capture in local const for type narrowing in closure
            const summary = fetchedSummary
            // Extract hostname only (no full URL) for safe logging
            let imageHostname: string | null = null
            if (summary.photoUrl && summary.photoUrl !== '/placeholders/sale-placeholder.svg') {
              try {
                const url = new URL(summary.photoUrl)
                imageHostname = url.hostname
              } catch {
                // Relative URL or placeholder
                imageHostname = summary.photoUrl.startsWith('/') ? 'relative' : 'unknown'
              }
            }
            
            setDebugTimings(prev => ({
              ...prev,
              summaryFetchTime: Math.round(performance.now() - (typeof window !== 'undefined' && (window as any).__checkoutMountTime ? (window as any).__checkoutMountTime : 0)),
              hasImageUrl: !!summary.photoUrl && summary.photoUrl !== '/placeholders/sale-placeholder.svg',
              imageHostname: imageHostname || '',
              imageState: (summary.photoUrl && summary.photoUrl !== '/placeholders/sale-placeholder.svg' ? 'loading' : 'no-image') as string,
            }))
          }
        } else {
          // Draft mode
          if (!draftKey) {
            setError('draft_key is required for draft mode')
            setLoading(false)
            return
          }

          const draftResult = await getDraftByKeyServer(draftKey)
          if (!draftResult.ok || !draftResult.data?.payload) {
            setError(draftResult.error || 'Failed to load draft information')
            setLoading(false)
            return
          }

          const payload = draftResult.data.payload
          fetchedSummary = {
            title: payload.formData?.title || 'Untitled Sale',
            city: payload.formData?.city || '',
            state: payload.formData?.state || '',
            photoUrl: payload.photos && payload.photos.length > 0 ? payload.photos[0] : null,
            dateStart: payload.formData?.date_start,
            timeStart: payload.formData?.time_start,
          }
          
          // Set image state based on whether photoUrl exists
          if (!fetchedSummary.photoUrl) {
            setImageState('no-image')
            fetchedSummary.photoUrl = '/placeholders/sale-placeholder.svg'
          } else {
            setImageState('loading')
          }
          
          if (isDebug && fetchedSummary) {
            // Capture in local const for type narrowing in closure
            const summary = fetchedSummary
            // Extract hostname only (no full URL) for safe logging
            let imageHostname: string | null = null
            if (summary.photoUrl && summary.photoUrl !== '/placeholders/sale-placeholder.svg') {
              try {
                const url = new URL(summary.photoUrl)
                imageHostname = url.hostname
              } catch {
                // Relative URL
                imageHostname = 'relative'
              }
            }
            
            setDebugTimings(prev => ({
              ...prev,
              draftFetchTime: Math.round(performance.now() - (typeof window !== 'undefined' && (window as any).__checkoutMountTime ? (window as any).__checkoutMountTime : 0)),
              hasImageUrl: !!summary.photoUrl && summary.photoUrl !== '/placeholders/sale-placeholder.svg',
              imageHostname: imageHostname || '',
            }))
          }
        }

        if (!fetchedSummary) {
          setError('Failed to load checkout information')
          setLoading(false)
          return
        }

        setSummary(fetchedSummary)

        // Step 2: Fetch client secret from API
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
          
          if (isDebug && typeof performance !== 'undefined') {
            performance.mark('client-secret-received')
            if (typeof window !== 'undefined' && (window as any).__checkoutMountTime) {
              performance.measure('client-secret-fetch', '__checkout-mount', 'client-secret-received')
              setDebugTimings(prev => ({
                ...prev,
                clientSecretTime: performance.now() - (window as any).__checkoutMountTime,
              }))
            }
          }

          // Fetch amount for display
          try {
            const amountResponse = await fetch('/api/promotions/amount?tier=featured_week', {
              cache: 'no-store',
            })
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
          
          // Log timings in debug mode
          if (isDebug && typeof performance !== 'undefined') {
            const measures = performance.getEntriesByType('measure')
            const timingData: Record<string, number> = {}
            measures.forEach((measure) => {
              if (measure.name.startsWith('stripe-') || measure.name.startsWith('payment-') || measure.name.startsWith('client-secret-')) {
                timingData[measure.name] = Math.round(measure.duration)
              }
            })
            if (Object.keys(timingData).length > 0) {
              setDebugTimings(prev => ({ ...prev, ...timingData }))
            }
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to initialize payment'
          setError(errorMessage)
          setLoading(false)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load checkout information'
        setError(errorMessage)
        setLoading(false)
      }
    }

    fetchSummaryAndClientSecret()
    
    // Cleanup timeout on unmount
    return () => {
      if (imageLoadTimeoutRef.current) {
        clearTimeout(imageLoadTimeoutRef.current)
      }
    }
  }, [draftKey, saleId, promotionId, urlMode, publishableKey])

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

  // Memoize Elements options to prevent recreation on every render
  // Must be called before any early returns (React hooks rules)
  const amount = amountCents || 299
  const elementsOptions: StripeElementsOptions | null = useMemo(() => {
    if (!clientSecret) return null
    return {
      clientSecret,
      appearance: {
        theme: 'stripe' as const,
      },
    }
  }, [clientSecret])

  // Skeleton loading component
  const SkeletonLoader = () => (
    <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="lg:grid lg:grid-cols-2">
          {/* Left column skeleton */}
          <div className="aspect-[16/9] lg:aspect-auto lg:h-full bg-gray-200 animate-pulse"></div>
          {/* Right column skeleton */}
          <div className="p-6 lg:p-8 space-y-6">
            <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
            <div className="h-32 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  )

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12">
        <SkeletonLoader />
      </div>
    )
  }

  // Error state (inside card)
  if (error && !clientSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-4xl w-full">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 lg:p-12">
            <div className="text-center max-w-md mx-auto">
              <div className="text-red-600 text-5xl mb-6">✕</div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-3">Payment Setup Failed</h1>
              <p className="text-gray-600 mb-8">{error}</p>
              <button
                onClick={() => router.back()}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-4xl w-full">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 lg:p-12">
            <div className="text-center max-w-md mx-auto">
              <div className="text-green-600 text-5xl mb-6">✓</div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-3">Payment Successful</h1>
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-4xl w-full">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 lg:p-12">
            <div className="text-center">
              <p className="text-gray-600 mb-6">Unable to initialize payment. Please try again.</p>
              <button
                onClick={() => router.back()}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-4xl w-full">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 lg:p-12">
            <div className="text-center max-w-md mx-auto">
              <div className="text-red-600 text-5xl mb-6">✕</div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-3">Payment Setup Failed</h1>
              <p className="text-gray-600 mb-8">Payment processing is not configured. Please contact support.</p>
              <button
                onClick={() => router.back()}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Format date/time for display
  const formatDateTime = (dateStart?: string, timeStart?: string) => {
    if (!dateStart) return null
    try {
      const date = new Date(dateStart)
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      if (timeStart) {
        // Format time (assuming HH:MM format)
        const [hours, minutes] = timeStart.split(':')
        const hour = parseInt(hours, 10)
        const ampm = hour >= 12 ? 'PM' : 'AM'
        const displayHour = hour % 12 || 12
        return `${dateStr} at ${displayHour}:${minutes} ${ampm}`
      }
      return dateStr
    } catch {
      return dateStart
    }
  }

  const displayDateTime = summary ? formatDateTime(summary.dateStart, summary.timeStart) : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-4xl w-full">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden relative">
          <div className="lg:grid lg:grid-cols-2">
            {/* Left Column: Sale Image & Summary */}
            <div className="relative aspect-[16/9] lg:aspect-auto bg-gray-100">
              {summary && summary.photoUrl && imageState !== 'no-image' ? (
                <>
                  {imageState === 'loading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-200 z-10">
                      <div className="text-gray-400 text-sm">Loading image...</div>
                    </div>
                  )}
                  <Image
                    src={summary.photoUrl}
                    alt={summary.title}
                    fill
                    className={`object-cover ${imageState === 'loading' ? 'opacity-0' : 'opacity-100'} transition-opacity`}
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    unoptimized={summary.photoUrl.startsWith('/placeholders/')}
                    priority
                    onLoad={() => {
                      // Clear timeout if image loads successfully
                      if (imageLoadTimeoutRef.current) {
                        clearTimeout(imageLoadTimeoutRef.current)
                        imageLoadTimeoutRef.current = null
                      }
                      setImageState('loaded')
                      if (isDebug) {
                        setDebugTimings(prev => ({
                          ...prev,
                          imageLoadSuccess: true,
                          imageLoadTime: Math.round(performance.now() - (typeof window !== 'undefined' && (window as any).__checkoutMountTime ? (window as any).__checkoutMountTime : 0)),
                          imageState: 'loaded',
                        }))
                      }
                    }}
                    onError={() => {
                      // Clear timeout on error
                      if (imageLoadTimeoutRef.current) {
                        clearTimeout(imageLoadTimeoutRef.current)
                        imageLoadTimeoutRef.current = null
                      }
                      setImageState('error')
                      if (isDebug) {
                        setDebugTimings(prev => ({
                          ...prev,
                          imageLoadError: true,
                          imageState: 'error',
                        }))
                      }
                    }}
                  />
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                  {/* Promoted Badge */}
                  <div className="absolute top-4 left-4">
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-green-600 text-white shadow-lg">
                      Promoted
                    </span>
                  </div>
                  {/* Summary Info Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8 text-white">
                    <h2 className="text-xl lg:text-2xl font-bold mb-2 line-clamp-2">
                      {summary.title}
                    </h2>
                    <div className="space-y-1 text-sm lg:text-base">
                      <p className="opacity-90">
                        {summary.city && summary.state
                          ? `${summary.city}, ${summary.state}`
                          : summary.city || summary.state || 'Location not specified'}
                      </p>
                      {displayDateTime && (
                        <p className="opacity-75 text-xs lg:text-sm">{displayDateTime}</p>
                      )}
                    </div>
                  </div>
                  {imageState === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-200 z-20">
                      <div className="text-center p-4">
                        <p className="text-gray-600 text-sm mb-2">Image unavailable</p>
                        <button
                          onClick={() => {
                            setImageState('loading')
                            // Force image reload by updating src
                            const img = document.querySelector('img[alt="' + summary.title + '"]') as HTMLImageElement
                            if (img) {
                              img.src = summary.photoUrl + '?retry=' + Date.now()
                            }
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700 underline"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                  <div className="text-center p-4">
                    <p className="text-gray-500 text-sm">No photo yet</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Payment Form */}
            <div className="p-6 lg:p-8 flex flex-col">
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">
                  Complete Your Payment
                </h1>
                
                {elementsOptions && (
                  <Elements stripe={stripePromise} options={elementsOptions} key={clientSecret}>
                    <PaymentForm
                      clientSecret={clientSecret}
                      amountCents={amount}
                      mode={mode}
                      onSuccess={handleSuccess}
                      onError={handleError}
                    />
                  </Elements>
                )}
              </div>
            </div>
            
            {/* Debug panel (only in debug mode) */}
            {isDebug && Object.keys(debugTimings).length > 0 && (
              <div className="absolute bottom-4 right-4 bg-black/80 text-white text-xs p-3 rounded-lg font-mono max-w-xs z-50 shadow-lg">
                <div className="font-bold mb-2 text-yellow-300">Checkout Debug</div>
                <div className="space-y-1">
                  {Object.entries(debugTimings).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <span className="text-gray-300">{key}:</span>
                      <span className="text-white">{typeof value === 'number' ? `${value}ms` : String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
