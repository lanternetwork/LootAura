/**
 * Stripe Client Wrapper
 * Server-only module for Stripe API interactions
 * 
 * NOTE: Requires 'stripe' package to be installed: npm install stripe
 * This module fails gracefully if Stripe is not configured.
 */

import Stripe from 'stripe'
import { ENV_SERVER } from '@/lib/env'

let stripeClient: Stripe | null = null

/**
 * Get Stripe client instance (lazy initialization)
 * Returns null if Stripe is not configured
 */
export function getStripeClient(): Stripe | null {
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
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
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

/**
 * Get Stripe publishable key (client-side)
 */
export function getStripePublishableKey(): string | null {
  if (typeof window === 'undefined') {
    // Server-side: return null (should use secret key instead)
    return null
  }
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null
}/**
 * Get featured week promotion amount in cents
 * Falls back to 299 cents ($2.99) if price ID is not configured
 */
export function getFeaturedWeekAmountCents(): number {
  // If price ID is configured, we'd need to fetch it from Stripe
  // For now, return hardcoded fallback
  // TODO: Could fetch from Stripe if price ID exists, but fallback is safer
  return 299 // $2.99 in cents
}