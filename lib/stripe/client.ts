/**
 * Stripe Client Wrapper
 * Server-only module for Stripe API interactions
 * 
 * NOTE: Requires 'stripe' package to be installed: npm install stripe
 * This module fails gracefully if Stripe is not configured.
 */

import { ENV_SERVER } from '@/lib/env'

let stripeClient: any = null

/**
 * Get Stripe client instance (lazy initialization)
 * Returns null if Stripe is not configured
 */
export function getStripeClient() {
  if (stripeClient) {
    return stripeClient
  }

  // Check if Stripe is enabled
  if (process.env.PAYMENTS_ENABLED !== 'true') {
    return null
  }

  // Check if Stripe secret key is configured
  const secretKey = ENV_SERVER.STRIPE_SECRET_KEY
  if (!secretKey) {
    return null
  }

  try {
    // Use eval to avoid bundling stripe when the package is not installed.
    // This keeps runtime behavior the same (graceful failure when missing)
    // while preventing build-time module resolution errors in environments
    // where stripe is not present.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Stripe = (eval('require') as typeof require)('stripe')
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2024-12-18.acacia',
    })
    return stripeClient
  } catch (error) {
    // Stripe package not installed or other error
    console.warn('[STRIPE] Stripe client initialization failed:', error)
    return null
  }
}

/**
 * Check if payments are enabled
 */
export function isPaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === 'true'
}

/**
 * Check if promotions are enabled (separate from payments)
 */
export function isPromotionsEnabled(): boolean {
  return process.env.PROMOTIONS_ENABLED === 'true'
}

/**
 * Get Stripe webhook secret
 */
export function getStripeWebhookSecret(): string | null {
  return ENV_SERVER.STRIPE_WEBHOOK_SECRET || null
}

/**
 * Get Stripe price ID for featured week promotion
 */
export function getFeaturedWeekPriceId(): string | null {
  return ENV_SERVER.STRIPE_PRICE_ID_FEATURED_WEEK || null
}

