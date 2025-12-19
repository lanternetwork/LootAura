/**
 * Stripe Webhook Handler
 * POST /api/webhooks/stripe
 * 
 * Handles Stripe webhook events with signature verification and idempotency.
 * Processes checkout.session.completed, payment_intent events, and refunds.
 */

import { NextRequest } from 'next/server'
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
    logger.error('Stripe webhook signature verification failed', error instanceof Error ? error : new Error(String(error)), {
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
      const draftKey = session.metadata?.draft_key

      if (!promotionId) {
        logger.warn('Checkout session completed without promotion_id metadata', {
          component: 'webhooks/stripe',
          operation: 'checkout_completed',
          session_id: session.id,
        })
        return
      }

      // Check if promotion already has a sale_id (idempotency check)
      const { data: existingPromotion } = await fromBase(admin, 'promotions')
        .select('id, sale_id, status')
        .eq('id', promotionId)
        .maybeSingle()

      if (existingPromotion?.sale_id) {
        // Sale already created - just activate promotion if not already active
        if (existingPromotion.status !== 'active') {
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
        }

        logger.info('Promotion already has sale, activated promotion', {
          component: 'webhooks/stripe',
          operation: 'checkout_completed',
          promotion_id: promotionId,
          sale_id: existingPromotion.sale_id,
          session_id: session.id,
        })
        break
      }

      // Handle draft_key flow (new promotion flow - create sale from draft)
      if (draftKey) {
        const { getRlsDb } = await import('@/lib/supabase/clients')
        const rls = getRlsDb()

        // Load draft with RLS
        const { data: draft, error: draftError } = await fromBase(rls, 'sale_drafts')
          .select('*')
          .eq('draft_key', draftKey)
          .eq('status', 'active')
          .maybeSingle()

        if (draftError || !draft) {
          const error = new Error(`Failed to load draft: ${draftError?.message || 'Draft not found'}`)
          logger.error('Failed to load draft for webhook', error, {
            component: 'webhooks/stripe',
            operation: 'load_draft',
            draft_key: draftKey,
            promotion_id: promotionId,
          })
          throw error
        }

        // Validate draft payload
        const { SaleDraftPayloadSchema } = await import('@/lib/validation/saleDraft')
        const validationResult = SaleDraftPayloadSchema.safeParse(draft.payload)
        if (!validationResult.success) {
          const error = new Error('Draft payload is invalid')
          logger.error('Draft payload validation failed in webhook', error, {
            component: 'webhooks/stripe',
            operation: 'validate_draft',
            draft_key: draftKey,
            promotion_id: promotionId,
            errors: validationResult.error.issues,
          })
          throw error
        }

        const payload = validationResult.data
        const { formData, photos, items } = payload

        // Validate required fields
        if (!formData.title || !formData.city || !formData.state || !formData.date_start || !formData.time_start || !formData.lat || !formData.lng) {
          const error = new Error('Draft is missing required fields')
          logger.error('Draft missing required fields in webhook', error, {
            component: 'webhooks/stripe',
            operation: 'validate_draft',
            draft_key: draftKey,
            promotion_id: promotionId,
          })
          throw error
        }

        // Normalize time_start to 30-minute increments
        let normalizedTimeStart = formData.time_start
        if (normalizedTimeStart && normalizedTimeStart.includes(':')) {
          const parts = normalizedTimeStart.split(':')
          const h = parseInt(parts[0] || '0', 10)
          const m = parseInt(parts[1] || '0', 10)
          const snapped = Math.round(m / 30) * 30
          const finalM = snapped === 60 ? 0 : snapped
          const finalH = snapped === 60 ? (h + 1) % 24 : h
          normalizedTimeStart = `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`
        }

        // Normalize tags
        const rawTags = (formData as any)?.tags
        const normalizedTags: string[] = Array.isArray(rawTags)
          ? rawTags
              .filter((t: any): t is string => typeof t === 'string')
              .map((t: string) => t.trim())
              .filter(Boolean)
          : typeof rawTags === 'string'
            ? rawTags
                .split(',')
                .map((t: string) => t.trim())
                .filter(Boolean)
            : []

        // Build sale payload - create in PUBLISHED state
        const salePayload = {
          owner_id: draft.user_id,
          title: formData.title,
          description: formData.description || null,
          address: formData.address || null,
          city: formData.city,
          state: formData.state,
          zip_code: formData.zip_code || null,
          lat: parseFloat(String(formData.lat)),
          lng: parseFloat(String(formData.lng)),
          date_start: formData.date_start,
          time_start: normalizedTimeStart,
          date_end: formData.date_end || null,
          time_end: formData.time_end || null,
          cover_image_url: photos && photos.length > 0 ? photos[0] : null,
          images: photos && photos.length > 1 ? photos.slice(1) : null,
          pricing_mode: formData.pricing_mode || 'negotiable',
          status: 'published', // CRITICAL: Create in published state
          privacy_mode: 'exact',
          is_featured: false,
          tags: normalizedTags,
        }

        // Create sale
        const { data: saleRow, error: saleError } = await fromBase(admin, 'sales')
          .insert(salePayload)
          .select('id')
          .single()

        if (saleError || !saleRow) {
          const error = new Error(`Failed to create sale: ${saleError?.message || 'Unknown error'}`)
          logger.error('Failed to create sale from draft in webhook', error, {
            component: 'webhooks/stripe',
            operation: 'create_sale',
            draft_key: draftKey,
            promotion_id: promotionId,
          })
          throw error
        }

        const createdSaleId = saleRow.id

        // Create items if any
        if (items && items.length > 0) {
          const { normalizeItemImages } = await import('@/lib/data/itemImageNormalization')
          const itemsPayload = items.map((item: any) => {
            const normalizedImages = normalizeItemImages({
              image_url: item.image_url,
              images: item.images,
            })
            
            return {
              sale_id: createdSaleId,
              name: item.name,
              description: item.description || null,
              price: item.price || null,
              category: item.category || null,
              images: normalizedImages.images,
              image_url: normalizedImages.image_url,
            }
          })

          const { error: itemsError } = await fromBase(admin, 'items')
            .insert(itemsPayload)

          if (itemsError) {
            const error = itemsError instanceof Error ? itemsError : new Error(String(itemsError))
            logger.error('Failed to create items from draft in webhook', error, {
              component: 'webhooks/stripe',
              operation: 'create_items',
              draft_key: draftKey,
              promotion_id: promotionId,
              sale_id: createdSaleId,
            })
            // Don't fail - sale is created, items can be added later
          }
        }

        // Update promotion with sale_id and activate
        const { error: updateError } = await fromBase(admin, 'promotions')
          .update({
            sale_id: createdSaleId,
            status: 'active',
            stripe_payment_intent_id: session.payment_intent as string | null,
            stripe_customer_id: session.customer as string | null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', promotionId)

        if (updateError) {
          const error = new Error(`Failed to activate promotion: ${updateError.message}`)
          logger.error('Failed to update promotion with sale_id in webhook', error, {
            component: 'webhooks/stripe',
            operation: 'update_promotion',
            promotion_id: promotionId,
            sale_id: createdSaleId,
          })
          throw error
        }

        // Delete draft after successful sale creation
        const { error: deleteError } = await fromBase(admin, 'sale_drafts')
          .delete()
          .eq('id', draft.id)
          .eq('draft_key', draftKey)
          .eq('user_id', draft.user_id)

        if (deleteError) {
          logger.warn('Failed to delete draft after sale creation in webhook (non-critical)', {
            component: 'webhooks/stripe',
            operation: 'delete_draft',
            draft_key: draftKey,
            promotion_id: promotionId,
            sale_id: createdSaleId,
            error: deleteError.message,
          })
          // Don't fail - sale is created and promotion is active
        }

        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[WEBHOOK] Sale created from draft and promotion activated:', {
            draft_key: draftKey,
            promotion_id: promotionId,
            sale_id: createdSaleId,
            session_id: session.id,
          })
        }

        logger.info('Sale created from draft and promotion activated via webhook', {
          component: 'webhooks/stripe',
          operation: 'checkout_completed',
          promotion_id: promotionId,
          sale_id: createdSaleId,
          draft_key: draftKey,
          session_id: session.id,
        })
        break
      }

      // Handle sale_id flow (backward compatibility - existing sales)
      if (saleId) {
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

        logger.info('Promotion activated via checkout session (existing sale)', {
          component: 'webhooks/stripe',
          operation: 'checkout_completed',
          promotion_id: promotionId,
          sale_id: saleId,
          session_id: session.id,
        })
        break
      }

      // Neither draft_key nor sale_id - log warning
      logger.warn('Checkout session completed without draft_key or sale_id', {
        component: 'webhooks/stripe',
        operation: 'checkout_completed',
        promotion_id: promotionId,
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

