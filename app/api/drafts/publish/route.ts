// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, getAdminDb, fromBase } from '@/lib/supabase/clients'
import { SaleDraftPayloadSchema } from '@/lib/validation/saleDraft'
import { isAllowedImageUrl } from '@/lib/images/validateImageUrl'
import { ok, fail } from '@/lib/http/json'
import * as Sentry from '@sentry/nextjs'
import { deleteSaleAndItemsForRollback } from '@/lib/data/draftsPublishRollback'

export const dynamic = 'force-dynamic'

// POST: Publish draft (transactional: create sale + items, mark draft as published)
export async function POST(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  // Track created resources for cleanup on failure (scoped to function)
  let createdSaleId: string | null = null
  let createdItemIds: string[] = []
  let draft: any = null
  let user: any = null

  try {
    const supabase = createSupabaseServerClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }

    user = authUser
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }

    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
    }
    
    const { draftKey } = body

    if (!draftKey || typeof draftKey !== 'string') {
      return fail(400, 'INVALID_INPUT', 'draftKey is required')
    }

    // Read draft with RLS
    const rls = getRlsDb()
    const { data: draftData, error: dErr } = await fromBase(rls, 'sale_drafts')
      .select('*')
      .eq('draft_key', draftKey)
      .eq('status', 'active')
      .maybeSingle()

    if (dErr) return fail(500, 'DRAFT_LOOKUP_FAILED', dErr.message, dErr)
    if (!draftData) return fail(404, 'DRAFT_NOT_FOUND', 'Draft not found')
    
    draft = draftData

    // Validate payload
    const validationResult = SaleDraftPayloadSchema.safeParse(draft.payload)
    if (!validationResult.success) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid draft payload')
    }

    const payload = validationResult.data
    const { formData, photos, items, wantsPromotion } = payload

    // Validate required fields
    if (!formData.title || !formData.city || !formData.state || !formData.date_start || !formData.time_start) {
      return fail(400, 'MISSING_FIELDS', 'Missing required fields')
    }

    // Validate image URLs
    const allImages = photos || []
    if (allImages.length > 0) {
      for (const imageUrl of allImages) {
        if (!isAllowedImageUrl(imageUrl)) {
          return fail(400, 'INVALID_IMAGE_URL', `Invalid image URL: ${imageUrl}`)
        }
      }
    }

    // Validate item image URLs
    for (const item of items || []) {
      if (item.image_url && !isAllowedImageUrl(item.image_url)) {
        return fail(400, 'INVALID_IMAGE_URL', `Invalid item image URL: ${item.image_url}`)
      }
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

    // Get lat/lng from formData (should be set by address autocomplete)
    // If missing, we'll need to geocode - for now, require it
    if (!formData.lat || !formData.lng) {
      return fail(400, 'MISSING_LOCATION', 'Location (lat/lng) is required')
    }
    const lat = formData.lat
    const lng = formData.lng

    // GATE: If promotion is requested, require payment before sale creation
    if (wantsPromotion === true) {
      const { getStripeClient, isPaymentsEnabled, isPromotionsEnabled, getFeaturedWeekPriceId } = await import('@/lib/stripe/client')
      const { logger } = await import('@/lib/log')
      
      // Debug-only verification logs for promotion/checkout invariants
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[VERIFY_PROMOTION] Promotion requested:', {
          wantsPromotion: true,
          owner_profile_id: user?.id,
          draftKey,
          timestamp: new Date().toISOString()
        })
      }
      
      // Validate all required inputs before attempting Stripe checkout
      if (!user || !user.id) {
        logger.error('Promotion requested but user profile not ready', new Error('PROFILE_NOT_READY'), {
          component: 'drafts/publish',
          operation: 'validate_promotion',
          draftKey,
          hasUser: !!user,
          userId: user?.id,
        })
        return fail(400, 'PROFILE_NOT_READY', 'User profile is not ready. Please refresh and try again.')
      }
      
      if (!draftKey || typeof draftKey !== 'string') {
        logger.error('Promotion requested but draftKey is invalid', new Error('INVALID_DRAFT_KEY'), {
          component: 'drafts/publish',
          operation: 'validate_promotion',
          draftKey,
          draftKeyType: typeof draftKey,
        })
        return fail(400, 'INVALID_PROMOTION_STATE', 'Draft key is missing or invalid. Please refresh and try again.')
      }
      
      // Safety gates: Payments and promotions must be enabled
      if (!isPaymentsEnabled()) {
        return fail(403, 'PAYMENTS_DISABLED', 'Payments are currently disabled', {
          message: 'Promoted listings are not available at this time. Please check back later.',
        })
      }
      
      if (!isPromotionsEnabled()) {
        return fail(403, 'PROMOTIONS_DISABLED', 'Promotions are currently disabled', {
          message: 'Promoted listings are not available at this time. Please check back later.',
        })
      }
      
      const stripe = getStripeClient()
      if (!stripe) {
        logger.error('Promotion requested but Stripe client not configured', new Error('STRIPE_NOT_CONFIGURED'), {
          component: 'drafts/publish',
          operation: 'validate_promotion',
          draftKey,
          userId: user.id,
        })
        return fail(500, 'STRIPE_NOT_CONFIGURED', 'Stripe is not properly configured')
      }
      
      const priceId = getFeaturedWeekPriceId()
      
      // Debug-only verification logs for promotion/checkout invariants
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[VERIFY_PROMOTION] Price ID retrieved:', {
          priceId: priceId || 'MISSING',
          hasPriceId: !!priceId
        })
      }
      
      if (!priceId) {
        logger.error('Promotion requested but price ID not configured', new Error('PRICE_ID_MISSING'), {
          component: 'drafts/publish',
          operation: 'validate_promotion',
          draftKey,
          userId: user.id,
        })
        return fail(500, 'PRICE_ID_MISSING', 'Promotion price ID is not configured')
      }
      
      // Get site URL for redirects
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      
      if (!siteUrl) {
        logger.error('Promotion requested but site URL not configured', new Error('SITE_URL_MISSING'), {
          component: 'drafts/publish',
          operation: 'validate_promotion',
          draftKey,
          userId: user.id,
        })
        return fail(500, 'SITE_URL_MISSING', 'Site URL is not configured')
      }
      
      // All validations passed - create Stripe Checkout Session with draft_key in metadata
      // Sale will be created after payment succeeds via webhook
      let checkoutSession
      try {
        checkoutSession = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          success_url: `${siteUrl}/sales?promoted=success`,
          cancel_url: `${siteUrl}/sell/new?resume=review&payment=canceled`,
          metadata: {
            draft_key: draftKey,
            owner_profile_id: user.id,
            tier: 'featured_week',
            wants_promotion: 'true',
          },
          customer_email: user.email || undefined,
        })
      } catch (error) {
        logger.error('Failed to create Stripe checkout session for promotion', error instanceof Error ? error : new Error(String(error)), {
          component: 'drafts/publish',
          operation: 'create_checkout_session',
          draftKey,
          userId: user.id,
        })
        return fail(500, 'STRIPE_ERROR', 'Failed to create checkout session')
      }
      
      if (!checkoutSession || !checkoutSession.url) {
        logger.error('Stripe checkout session created but URL is missing', new Error('CHECKOUT_URL_MISSING'), {
          component: 'drafts/publish',
          operation: 'create_checkout_session',
          draftKey,
          userId: user.id,
          hasSession: !!checkoutSession,
        })
        return fail(500, 'CHECKOUT_URL_MISSING', 'Checkout session was created but URL is missing')
      }
      
      // Debug-only verification logs for promotion/checkout invariants
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[VERIFY_PROMOTION] Checkout session created successfully:', {
          checkoutUrl: checkoutSession.url,
          requiresPayment: true,
          owner_profile_id: user.id,
          priceId,
          draftKey,
          timestamp: new Date().toISOString()
        })
        console.log('[VERIFY_PROMOTION] Returning requiresPayment: true - sale creation code path will NOT be reached')
      }
      
      // Return checkout URL instead of creating sale
      // VERIFICATION: This return ensures sale creation code path (lines 196+) is NEVER reached when wantsPromotion === true
      return ok({ 
        data: { 
          checkoutUrl: checkoutSession.url,
          requiresPayment: true 
        } 
      })
    }

    // Debug-only verification logs for promotion/checkout invariants
    // This code path should NEVER be reached when wantsPromotion === true
    // If this log appears when wantsPromotion === true, the invariant is broken
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[VERIFY_PROMOTION] Sale creation code path reached:', {
        wantsPromotion: payload.wantsPromotion,
        timestamp: new Date().toISOString(),
        note: 'If wantsPromotion === true above, this is a BUG - sale creation should not happen'
      })
    }

    // Use a transaction-like approach: create sale, then items, then update draft
    // Note: Supabase doesn't support true transactions across multiple operations,
    // so we'll do them sequentially and handle errors with compensation logic

    // Write sale/items with admin (or RLS if policies allow)
    const admin = getAdminDb()

    // Normalize tags from draft formData. Accepts either string[] or comma-separated string; trims and deduplicates.
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

    // Build salePayload
    const salePayload = {
      owner_id: user.id,
      title: formData.title,
      description: formData.description || null,
      address: formData.address || null,
      city: formData.city,
      state: formData.state,
      zip_code: formData.zip_code || null,
      lat: parseFloat(String(lat)),
      lng: parseFloat(String(lng)),
      date_start: formData.date_start,
      time_start: normalizedTimeStart,
      date_end: formData.date_end || null,
      time_end: formData.time_end || null,
      cover_image_url: photos && photos.length > 0 ? photos[0] : null,
      images: photos && photos.length > 1 ? photos.slice(1) : null,
      pricing_mode: formData.pricing_mode || 'negotiable',
      status: 'published',
      privacy_mode: 'exact', // Required field
      is_featured: false,
      tags: normalizedTags,
    }

    // 1. Create sale - write to base table using schema-scoped client
    const { data: saleRow, error: sErr } = await fromBase(admin, 'sales')
      .insert(salePayload)
      .select('id')
      .single()

    if (sErr) {
      const { logger } = await import('@/lib/log')
      const saleError = sErr instanceof Error ? sErr : new Error(String(sErr))
      logger.error('Failed to create sale during draft publish', saleError, {
        component: 'drafts/publish',
        operation: 'create_sale',
        draftId: draft.id,
        userId: user.id,
      })
      return fail(500, 'SALE_CREATE_FAILED', saleError.message, saleError)
    }

    createdSaleId = saleRow.id

    // Build itemsPayload with normalized image fields
    // Normalize to canonical format: images array (primary) + image_url (compatibility)
    const { normalizeItemImages } = await import('@/lib/data/itemImageNormalization')
    const itemsPayload = items && items.length > 0 ? items.map((item: any) => {
      // Normalize image fields to canonical format
      const normalizedImages = normalizeItemImages({
        image_url: item.image_url,
        images: item.images, // Draft may have images array
      })
      
      const payload: any = {
        sale_id: createdSaleId,
        name: item.name,
        description: item.description || null,
        price: item.price || null,
        category: item.category || null,
        // Always set both fields for consistency (base table is authoritative)
        images: normalizedImages.images,
        image_url: normalizedImages.image_url,
      }
      
      return payload
    }) : []

    // 2. Create items if any
    if (itemsPayload.length) {
      const { isDebugMode } = await import('@/lib/env')
      if (isDebugMode()) {
        console.log('[DRAFT_PUBLISH] Creating items:', {
          saleId: createdSaleId ?? undefined,
          saleStatus: salePayload.status,
          itemsCount: itemsPayload.length,
          items: itemsPayload.map((i: any) => ({ name: i.name, hasImage: !!i.image_url })),
        })
      }
      
      const { data: insertedItems, error: iErr } = await fromBase(admin, 'items')
        .insert(itemsPayload)
        .select('id, name, sale_id, image_url')
      
      if (iErr) {
        const { logger } = await import('@/lib/log')
        const itemsError = iErr instanceof Error ? iErr : new Error(String(iErr))
        logger.error('Failed to create items during draft publish', itemsError, {
          component: 'drafts/publish',
          operation: 'create_items',
          draftId: draft.id,
          userId: user.id,
          saleId: createdSaleId ?? undefined,
        })
        
        // Cleanup: rollback the sale and any partially created items
        if (createdSaleId) {
          await deleteSaleAndItemsForRollback(admin, createdSaleId)
        }
        
        return fail(500, 'ITEMS_CREATE_FAILED', itemsError.message, itemsError)
      }
      
      // Track created item IDs for business event logging
      if (insertedItems) {
        createdItemIds = insertedItems.map((item: any) => item.id)
      }
      
      const { isDebugMode: isDebugModeItems } = await import('@/lib/env')
      if (isDebugModeItems()) {
        console.log('[DRAFT_PUBLISH] Items created successfully:', {
          saleId: createdSaleId ?? undefined,
          itemsCreated: insertedItems?.length || 0,
          itemIds: insertedItems?.map((i: any) => i.id),
        })
      }
      
      // Verify items are readable from base table (using admin client to bypass RLS for verification)
      // Note: admin client is schema-scoped to lootaura_v2, so we query the base table, not the view
      const { data: verifyItems, error: verifyErr } = await fromBase(admin, 'items')
        .select('id, name, sale_id, image_url')
        .eq('sale_id', createdSaleId)
      
      if (isDebugModeItems()) {
        console.log('[DRAFT_PUBLISH] Items verification (admin client):', {
          saleId: createdSaleId ?? undefined,
          itemsFound: verifyItems?.length || 0,
          error: verifyErr,
          itemIds: verifyItems?.map((i: any) => i.id),
        })
      }
    } else {
      const { isDebugMode: isDebugModeNoItems } = await import('@/lib/env')
      if (isDebugModeNoItems()) {
        console.log('[DRAFT_PUBLISH] No items to create for sale:', createdSaleId)
      }
    }

    // Enqueue image post-processing jobs for sale images (non-blocking, non-critical)
    try {
      const { enqueueJob, JOB_TYPES } = await import('@/lib/jobs')
      const { logger } = await import('@/lib/log')
      const imagesToProcess: string[] = []
      
      if (salePayload.cover_image_url) {
        imagesToProcess.push(salePayload.cover_image_url)
      }
      if (salePayload.images && Array.isArray(salePayload.images)) {
        imagesToProcess.push(...salePayload.images)
      }
      
      // Enqueue jobs for each image (fire-and-forget)
      for (const imageUrl of imagesToProcess) {
        enqueueJob(JOB_TYPES.IMAGE_POSTPROCESS, {
          imageUrl,
          saleId: createdSaleId,
          ownerId: user.id,
        }).catch((err) => {
          // Log but don't fail - job enqueueing is non-critical
          logger.warn('Failed to enqueue image post-processing job (non-critical)', {
            component: 'drafts/publish',
            operation: 'enqueue_image_job',
            imageUrl,
            saleId: createdSaleId ?? undefined,
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }
    } catch (jobErr) {
      // Ignore job enqueueing errors - this is non-critical
      const { logger } = await import('@/lib/log')
      logger.warn('Failed to enqueue image post-processing jobs (non-critical)', {
        component: 'drafts/publish',
        operation: 'enqueue_image_jobs',
        saleId: createdSaleId ?? undefined,
        error: jobErr instanceof Error ? jobErr.message : String(jobErr),
      })
    }

    // 3. Delete the draft after successful publication (hard delete)
    // We delete instead of marking as 'published' since the sale is now live
    // Use admin client since we've already verified ownership via RLS read above
    // This ensures the delete succeeds even if RLS has permission issues
    const { isDebugMode: isDebugModeDelete } = await import('@/lib/env')
    if (isDebugModeDelete()) {
      console.log('[PUBLISH/POST] Attempting to delete draft:', {
        draftId: draft.id,
        draftKey: draft.draft_key,
        userId: user.id,
        saleId: createdSaleId ?? undefined,
      })
    }
    
    // Delete the draft using admin client (bypasses RLS)
    // Use both id and draft_key for extra safety and to ensure we match the right draft
    const { data: deleteData, error: deleteErr } = await fromBase(admin, 'sale_drafts')
      .delete()
      .eq('id', draft.id)
      .eq('draft_key', draft.draft_key) // Match on draft_key as well for extra safety
      .eq('user_id', user.id) // Extra safety check: ensure we only delete drafts owned by the user
      .eq('status', 'active') // Only delete active drafts
      .select('id') // Select to get deleted row count

    if (deleteErr) {
      // Sale and items are already created, so we'll log but not fail
      // The draft will remain but the sale is published, which is acceptable
      // This is a non-critical failure - the sale is live, draft cleanup can happen later
      const { logger } = await import('@/lib/log')
      logger.warn('Failed to delete draft after successful publish (non-critical)', {
        component: 'drafts/publish',
        operation: 'delete_draft',
        draftId: draft.id,
        userId: user.id,
        saleId: createdSaleId ?? undefined,
        error: deleteErr.message,
      })
      Sentry.captureException(deleteErr, { 
        tags: { operation: 'publishDraft', step: 'deleteDraft' },
        extra: { draftId: draft.id, userId: user.id, saleId: createdSaleId ?? undefined },
      })
    } else {
      // Verify deletion by checking if any rows were deleted
      const deletedCount = deleteData?.length || 0
      if (deletedCount === 0) {
        // Try to verify by reading the draft again - if it still exists, the delete failed
        const { data: verifyDraft, error: verifyErr } = await fromBase(admin, 'sale_drafts')
          .select('id, status')
          .eq('id', draft.id)
          .maybeSingle()
        
        if (verifyDraft) {
          console.error('[PUBLISH/POST] Draft still exists after delete attempt:', {
            draftId: draft.id,
            draftKey: draft.draft_key,
            userId: user.id,
            saleId: createdSaleId ?? undefined,
            currentStatus: verifyDraft.status,
            deleteData,
            verifyError: verifyErr,
          })
          Sentry.captureMessage('Draft still exists after delete attempt', {
            level: 'error',
            tags: { operation: 'publishDraft', step: 'deleteDraft' },
            extra: { draftId: draft.id, userId: user.id, saleId: createdSaleId ?? undefined, currentStatus: verifyDraft.status },
          })
        } else {
          // Draft doesn't exist, so deletion succeeded even though select returned nothing
          if (isDebugModeDelete()) {
            console.log('[PUBLISH/POST] Draft deleted successfully (verified by read):', {
              draftId: draft.id,
              draftKey: draft.draft_key,
              saleId: createdSaleId ?? undefined,
            })
          }
        }
      } else {
        if (isDebugModeDelete()) {
          console.log('[PUBLISH/POST] Draft deleted successfully after publication:', {
            draftId: draft.id,
            draftKey: draft.draft_key,
            saleId: createdSaleId ?? undefined,
            deletedCount,
          })
        }
      }
    }

    // Log business event: draft published
    const { logDraftPublished } = await import('@/lib/events/businessEvents')
    logDraftPublished(draft.id, createdSaleId ?? '', user.id, createdItemIds.length)
    
    // Trigger sale created confirmation email (fire-and-forget, non-blocking)
    if (createdSaleId && user.email) {
      try {
        // Fetch full sale data for email
        const { data: saleData } = await fromBase(admin, 'sales')
          .select('*')
          .eq('id', createdSaleId)
          .single()

        if (saleData && saleData.status === 'published') {
          // Get user profile for display name (optional)
          let displayName: string | undefined
          try {
            const { getUserProfile } = await import('@/lib/data/profileAccess')
            const profile = await getUserProfile(supabase, user.id)
            displayName = profile?.display_name ?? undefined
          } catch {
            // Profile fetch failed - continue without display name
          }

          // Use user's timezone or default to America/New_York
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'

          // Send email using the new comprehensive function (non-blocking)
          const { sendSaleCreatedEmail } = await import('@/lib/email/sales')
          const emailResult = await sendSaleCreatedEmail({
            sale: saleData as any, // Type assertion needed due to Supabase query result type
            owner: {
              email: user.email,
              displayName,
            },
            timezone,
          })
          
          // Log email result for debugging (non-blocking, doesn't affect response)
          if (!emailResult.ok) {
            const { logger } = await import('@/lib/log')
            logger.warn('Sale created email send failed (non-critical)', {
              component: 'drafts/publish',
              operation: 'send_email',
              draftId: draft.id,
              saleId: createdSaleId ?? undefined,
              userId: user.id,
              ownerEmail: user.email,
              error: emailResult.error || 'Unknown error',
              // Include email config status for debugging
              emailsEnabled: process.env.LOOTAURA_ENABLE_EMAILS === 'true',
              hasResendApiKey: !!process.env.RESEND_API_KEY,
              hasResendFromEmail: !!process.env.RESEND_FROM_EMAIL,
            })
          } else if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[DRAFTS/PUBLISH] Sale created email sent successfully:', {
              saleId: createdSaleId,
              ownerEmail: user.email,
            })
          }
        }
      } catch (emailError) {
        // Log but don't fail - email is non-critical
        const { logger } = await import('@/lib/log')
        logger.warn('Failed to trigger sale created confirmation email (non-critical)', {
          component: 'drafts/publish',
          operation: 'trigger_email',
          saleId: createdSaleId ?? undefined,
          userId: user.id,
          error: emailError instanceof Error ? emailError.message : String(emailError),
        })
      }
    }
    
    return ok({ data: { saleId: createdSaleId ?? undefined } })
  } catch (e: any) {
    const { logger } = await import('@/lib/log')
    const { isProduction } = await import('@/lib/env')
    
    // If we have created resources, attempt cleanup using rollback helper
    // This handles deletion of both items (by sale_id) and the sale itself
    if (createdSaleId) {
      const admin = getAdminDb()
      await deleteSaleAndItemsForRollback(admin, createdSaleId)
    }
    
    const error = e instanceof Error ? e : new Error(String(e))
    logger.error('Draft publish failed with exception', error, {
      component: 'drafts/publish',
      operation: 'publish_draft',
      draftId: draft?.id,
      userId: user?.id,
      saleId: createdSaleId ?? undefined,
    })
    
    if (!isProduction()) {
      console.error('[PUBLISH/POST] thrown:', e)
    }
    Sentry.captureException(error, { tags: { operation: 'publishDraft' } })
    return fail(500, 'PUBLISH_FAILED', error.message)
  }
}

