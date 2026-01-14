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

/**
 * Finalize draft-based sale creation with promotion
 * Reusable function for both checkout.session.completed and payment_intent.succeeded
 */
async function finalizeDraftPromotion(
  draftKey: string,
  paymentIntentId: string | null,
  admin: ReturnType<typeof getAdminDb>
): Promise<{ saleId: string; promotionId: string | null }> {
  const { fromBase } = await import('@/lib/supabase/clients')
  const { getRlsDb } = await import('@/lib/supabase/clients')
  const { SaleDraftPayloadSchema } = await import('@/lib/validation/saleDraft')
  
  // Check idempotency: has this draft already been finalized?
  const rls = getRlsDb()
  const { data: draft, error: draftError } = await fromBase(rls, 'sale_drafts')
    .select('*')
    .eq('draft_key', draftKey)
    .eq('status', 'active')
    .maybeSingle()
  
  if (draftError || !draft) {
    // Draft not found - check if this was already processed (idempotency)
    // Look for promotion with matching payment_intent_id
    if (paymentIntentId) {
      const { data: existingPromotion } = await fromBase(admin, 'promotions')
        .select('id, sale_id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle()
      
      if (existingPromotion) {
        // Already processed - idempotent
        logger.info('Draft promotion already finalized (idempotent)', {
          component: 'webhooks/stripe',
          operation: 'finalize_draft_promotion',
          draft_key: draftKey,
          sale_id: existingPromotion.sale_id,
          promotion_id: existingPromotion.id,
          payment_intent_id: paymentIntentId,
        })
        return { saleId: existingPromotion.sale_id, promotionId: existingPromotion.id }
      }
    }
    
    // Draft not found and no existing promotion - this is an error
    const error = draftError ? new Error(draftError.message) : new Error('Draft not found')
    logger.error('Failed to read draft for sale creation after payment', error, {
      component: 'webhooks/stripe',
      operation: 'finalize_draft_promotion',
      draft_key: draftKey,
      payment_intent_id: paymentIntentId,
    })
    throw error
  }
  
  // Validate payload
  const validationResult = SaleDraftPayloadSchema.safeParse(draft.payload)
  if (!validationResult.success) {
    throw new Error('Invalid draft payload')
  }
  
  const payload = validationResult.data
  const { formData, photos, items } = payload
  
  // Get user ID from draft (already validated during draft creation)
  const userId = draft.user_id
  
  // Normalize time_start
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
    ? rawTags.filter((t: any): t is string => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean)
    : typeof rawTags === 'string'
      ? rawTags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []
  
  // Create sale with promotion
  const salePayload = {
    owner_id: userId,
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
    status: 'published',
    privacy_mode: 'exact',
    is_featured: true, // Promotion enabled
    tags: normalizedTags,
  }
  
  const { data: saleRow, error: saleError } = await fromBase(admin, 'sales')
    .insert(salePayload)
    .select('id')
    .single()
  
  if (saleError) {
    throw new Error(`Failed to create sale: ${saleError.message}`)
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
    
    const { error: itemsError } = await fromBase(admin, 'items').insert(itemsPayload)
    if (itemsError) {
      // Rollback sale
      await fromBase(admin, 'sales').delete().eq('id', createdSaleId)
      throw new Error(`Failed to create items: ${itemsError.message}`)
    }
  }
  
  // Create promotion record
  const { data: promotion, error: promotionError } = await fromBase(admin, 'promotions')
    .insert({
      sale_id: createdSaleId,
      owner_profile_id: userId,
      tier: 'featured_week',
      status: 'active',
      stripe_payment_intent_id: paymentIntentId,
      start_date: new Date().toISOString(),
    })
    .select('id')
    .single()
  
  if (promotionError) {
    logger.error('Failed to create promotion record', new Error(promotionError.message), {
      component: 'webhooks/stripe',
      operation: 'finalize_draft_promotion',
      sale_id: createdSaleId,
    })
    // Don't fail - sale is created, promotion can be fixed manually
  }
  
  // Delete draft
  await fromBase(admin, 'sale_drafts')
    .delete()
    .eq('id', draft.id)
    .eq('draft_key', draftKey)
  
  logger.info('Sale created with promotion after payment', {
    component: 'webhooks/stripe',
    operation: 'finalize_draft_promotion',
    sale_id: createdSaleId,
    promotion_id: promotion?.id,
    draft_key: draftKey,
    payment_intent_id: paymentIntentId,
  })
  
  return { saleId: createdSaleId, promotionId: promotion?.id || null }
}

/**
 * Finalize existing sale promotion
 * Reusable function for both checkout.session.completed and payment_intent.succeeded
 */
async function finalizeExistingSalePromotion(
  promotionId: string,
  saleId: string,
  paymentIntentId: string | null,
  admin: ReturnType<typeof getAdminDb>
): Promise<void> {
  const { fromBase } = await import('@/lib/supabase/clients')
  
  // Check idempotency: is promotion already active?
  const { data: existingPromotion } = await fromBase(admin, 'promotions')
    .select('id, status')
    .eq('id', promotionId)
    .maybeSingle()
  
  if (!existingPromotion) {
    throw new Error(`Promotion not found: ${promotionId}`)
  }
  
  if (existingPromotion.status === 'active') {
    // Already finalized - idempotent
    logger.info('Promotion already active (idempotent)', {
      component: 'webhooks/stripe',
      operation: 'finalize_existing_sale_promotion',
      promotion_id: promotionId,
      sale_id: saleId,
      payment_intent_id: paymentIntentId,
    })
    return
  }
  
  // Update promotion to active
  const { error: updateError } = await fromBase(admin, 'promotions')
    .update({
      status: 'active',
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', promotionId)
    .eq('status', 'pending') // Only update if still pending (idempotency)

  if (updateError) {
    throw new Error(`Failed to activate promotion: ${updateError.message}`)
  }

  logger.info('Promotion activated via payment', {
    component: 'webhooks/stripe',
    operation: 'finalize_existing_sale_promotion',
    promotion_id: promotionId,
    sale_id: saleId,
    payment_intent_id: paymentIntentId,
  })
}

async function processStripeEvent(event: any, admin: ReturnType<typeof getAdminDb>) {
  const { fromBase } = await import('@/lib/supabase/clients')

  switch (event.type) {
    case 'checkout.session.completed': {
      // LEGACY: Keep this handler for existing Checkout Sessions created before migration
      // New promotion flows use payment_intent.succeeded instead
      // This handler will be removed after all legacy sessions expire
      const session = event.data.object
      const promotionId = session.metadata?.promotion_id
      const saleId = session.metadata?.sale_id
      const draftKey = session.metadata?.draft_key
      const wantsPromotion = session.metadata?.wants_promotion === 'true'

      // Handle draft-based sale creation (new publish flow with promotion)
      if (draftKey && wantsPromotion) {
        await finalizeDraftPromotion(
          draftKey,
          session.payment_intent as string | null,
          admin
        )
        break
      }
      
      // Handle existing sale promotion (legacy flow)
      if (promotionId && saleId) {
        await finalizeExistingSalePromotion(
          promotionId,
          saleId,
          session.payment_intent as string | null,
          admin
        )
        break
      }
      
      // No valid metadata
      logger.warn('Checkout session completed without valid metadata', {
        component: 'webhooks/stripe',
        operation: 'checkout_completed',
        session_id: session.id,
        metadata: session.metadata,
      })
      break
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object
      const metadata = paymentIntent.metadata || {}
      const promotionId = metadata.promotion_id
      const saleId = metadata.sale_id
      const draftKey = metadata.draft_key
      const wantsPromotion = metadata.wants_promotion === 'true'
      const paymentIntentId = paymentIntent.id

      // Handle draft-based sale creation (new publish flow with promotion)
      if (draftKey && wantsPromotion) {
        await finalizeDraftPromotion(draftKey, paymentIntentId, admin)
        break
      }

      // Handle existing sale promotion
      if (promotionId && saleId) {
        await finalizeExistingSalePromotion(promotionId, saleId, paymentIntentId, admin)
        break
      }

      // No valid metadata
      logger.warn('PaymentIntent succeeded without valid metadata', {
        component: 'webhooks/stripe',
        operation: 'payment_intent_succeeded',
        payment_intent_id: paymentIntentId,
        metadata,
      })
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object
      const metadata = paymentIntent.metadata || {}
      const promotionId = metadata.promotion_id

      if (!promotionId) {
        logger.warn('Payment failed without promotion_id', {
          component: 'webhooks/stripe',
          operation: 'payment_intent_payment_failed',
          payment_intent_id: paymentIntent.id,
        })
        break
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
        operation: 'payment_intent_payment_failed',
        promotion_id: promotionId,
        payment_intent_id: paymentIntent.id,
      })
      break
    }

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

