/**
 * Stripe Webhook Handler
 * POST /api/webhooks/stripe
 * 
 * Handles Stripe webhook events with signature verification and idempotency.
 * Processes checkout.session.completed, payment_intent events, and refunds.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { getStripeClient, getStripeWebhookSecret } from '@/lib/stripe/client'
import { logger } from '@/lib/log'
import { fail, ok } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

// Webhook endpoint is exempt from CSRF (uses Stripe signature verification instead)
// Add to csrfRoutes.ts exempt list if needed

async function webhookHandler(request: NextRequest) {
  // Get raw body for signature verification
  // Next.js 14+ provides raw body via request.body stream
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    logger.warn('Stripe webhook missing signature', {
      component: 'webhooks/stripe',
      operation: 'verify_signature',
    })
    return fail(400, 'MISSING_SIGNATURE', 'Missing Stripe signature header')
  }

  // Get webhook secret
  const webhookSecret = getStripeWebhookSecret()
  if (!webhookSecret) {
    logger.error('Stripe webhook secret not configured', new Error('STRIPE_WEBHOOK_SECRET not set'), {
      component: 'webhooks/stripe',
      operation: 'verify_signature',
    })
    return fail(500, 'CONFIG_ERROR', 'Webhook secret not configured')
  }

  // Get Stripe client
  const stripe = getStripeClient()
  if (!stripe) {
    logger.error('Stripe client not available', new Error('Stripe client initialization failed'), {
      component: 'webhooks/stripe',
      operation: 'verify_signature',
    })
    return fail(500, 'STRIPE_ERROR', 'Stripe client not available')
  }

  // Verify webhook signature
  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    logger.warn('Stripe webhook signature verification failed', error instanceof Error ? error : new Error(String(error)), {
      component: 'webhooks/stripe',
      operation: 'verify_signature',
    })
    return fail(400, 'INVALID_SIGNATURE', 'Invalid webhook signature')
  }

  // Check idempotency: has this event been processed?
  const admin = getAdminDb()
  const { data: existingEvent } = await fromBase(admin, 'stripe_webhook_events')
    .select('id, processed_at, error_message')
    .eq('event_id', event.id)
    .maybeSingle()

  if (existingEvent) {
    // Event already processed - return success (idempotent)
    logger.info('Stripe webhook event already processed (idempotent)', {
      component: 'webhooks/stripe',
      operation: 'process_event',
      event_id: event.id,
      event_type: event.type,
      previously_processed_at: existingEvent.processed_at,
    })
    return ok({ processed: true, idempotent: true })
  }

  // Record event as processing
  const { error: insertError } = await fromBase(admin, 'stripe_webhook_events')
    .insert({
      event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
    })

  if (insertError) {
    // If insert fails due to unique constraint, another process handled it
    // This is fine - return success (idempotent)
    logger.info('Stripe webhook event insert failed (likely duplicate)', {
      component: 'webhooks/stripe',
      operation: 'record_event',
      event_id: event.id,
      error: insertError.message,
    })
    return ok({ processed: true, idempotent: true })
  }

  // Process event based on type
  try {
    await processStripeEvent(event, admin)
  } catch (error) {
    // Update event record with error
    await fromBase(admin, 'stripe_webhook_events')
      .update({
        error_message: error instanceof Error ? error.message : String(error),
        retry_count: 1, // Stripe will retry
      })
      .eq('event_id', event.id)

    logger.error('Failed to process Stripe webhook event', error instanceof Error ? error : new Error(String(error)), {
      component: 'webhooks/stripe',
      operation: 'process_event',
      event_id: event.id,
      event_type: event.type,
    })

    // Return 500 so Stripe retries
    return fail(500, 'PROCESSING_ERROR', 'Failed to process webhook event')
  }

  logger.info('Stripe webhook event processed successfully', {
    component: 'webhooks/stripe',
    operation: 'process_event',
    event_id: event.id,
    event_type: event.type,
  })

  return ok({ processed: true })
}

async function processStripeEvent(event: any, admin: ReturnType<typeof getAdminDb>) {
  const { fromBase } = await import('@/lib/supabase/clients')

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const promotionId = session.metadata?.promotion_id
      const saleId = session.metadata?.sale_id

      if (!promotionId) {
        logger.warn('Checkout session completed without promotion_id metadata', {
          component: 'webhooks/stripe',
          operation: 'checkout_completed',
          session_id: session.id,
        })
        return
      }

      // Update promotion to active
      const { error: updateError } = await fromBase(admin, 'promotions')
        .update({
          status: 'active',
          stripe_payment_intent_id: session.payment_intent as string | null,
          stripe_customer_id: session.customer as string | null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', promotionId)

      if (updateError) {
        throw new Error(`Failed to activate promotion: ${updateError.message}`)
      }

      logger.info('Promotion activated via checkout session', {
        component: 'webhooks/stripe',
        operation: 'checkout_completed',
        promotion_id: promotionId,
        sale_id: saleId,
        session_id: session.id,
      })
      break
    }

    case 'payment_intent.payment_failed':
    case 'checkout.session.expired': {
      const sessionOrIntent = event.data.object
      const promotionId = sessionOrIntent.metadata?.promotion_id || 
        (sessionOrIntent.id ? await findPromotionByCheckoutSession(sessionOrIntent.id, admin) : null)

      if (!promotionId) {
        logger.warn('Payment failed/expired without promotion_id', {
          component: 'webhooks/stripe',
          operation: 'payment_failed',
          session_or_intent_id: sessionOrIntent.id,
        })
        return
      }

      // Cancel promotion
      const { error: updateError } = await fromBase(admin, 'promotions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', promotionId)
        .eq('status', 'pending') // Only cancel if still pending

      if (updateError) {
        throw new Error(`Failed to cancel promotion: ${updateError.message}`)
      }

      logger.info('Promotion canceled due to payment failure', {
        component: 'webhooks/stripe',
        operation: 'payment_failed',
        promotion_id: promotionId,
      })
      break
    }

    case 'charge.refunded':
    case 'payment_intent.refunded': {
      const chargeOrIntent = event.data.object
      const paymentIntentId = chargeOrIntent.payment_intent || chargeOrIntent.id

      if (!paymentIntentId) {
        logger.warn('Refund event without payment_intent_id', {
          component: 'webhooks/stripe',
          operation: 'refund',
          charge_id: chargeOrIntent.id,
        })
        return
      }

      // Find promotion by payment intent
      const { data: promotion } = await fromBase(admin, 'promotions')
        .select('id, sale_id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle()

      if (!promotion) {
        logger.warn('Refund event for unknown promotion', {
          component: 'webhooks/stripe',
          operation: 'refund',
          payment_intent_id: paymentIntentId,
        })
        return
      }

      // Mark as refunded and expired
      const { error: updateError } = await fromBase(admin, 'promotions')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', promotion.id)

      if (updateError) {
        throw new Error(`Failed to mark promotion as refunded: ${updateError.message}`)
      }

      logger.info('Promotion marked as refunded', {
        component: 'webhooks/stripe',
        operation: 'refund',
        promotion_id: promotion.id,
        sale_id: promotion.sale_id,
      })
      break
    }

    default:
      // Log unhandled event types but don't fail
      logger.info('Unhandled Stripe webhook event type', {
        component: 'webhooks/stripe',
        operation: 'process_event',
        event_type: event.type,
        event_id: event.id,
      })
  }
}

async function findPromotionByCheckoutSession(
  checkoutSessionId: string,
  admin: ReturnType<typeof getAdminDb>
): Promise<string | null> {
  const { fromBase } = await import('@/lib/supabase/clients')
  const { data: promotion } = await fromBase(admin, 'promotions')
    .select('id')
    .eq('stripe_checkout_session_id', checkoutSessionId)
    .maybeSingle()

  return promotion?.id || null
}

export const POST = webhookHandler

