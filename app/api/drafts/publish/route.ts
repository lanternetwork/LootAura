// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, getAdminDb, fromBase } from '@/lib/supabase/clients'
import { SaleDraftPayloadSchema } from '@/lib/validation/saleDraft'
import { isAllowedImageUrl } from '@/lib/images/validateImageUrl'
import { ok, fail } from '@/lib/http/json'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

// POST: Publish draft (transactional: create sale + items, mark draft as published)
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
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
    const { data: draft, error: dErr } = await fromBase(rls, 'sale_drafts')
      .select('*')
      .eq('draft_key', draftKey)
      .eq('status', 'active')
      .maybeSingle()

    if (dErr) return fail(500, 'DRAFT_LOOKUP_FAILED', dErr.message, dErr)
    if (!draft) return fail(404, 'DRAFT_NOT_FOUND', 'Draft not found')

    // Validate payload
    const validationResult = SaleDraftPayloadSchema.safeParse(draft.payload)
    if (!validationResult.success) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid draft payload')
    }

    const payload = validationResult.data
    const { formData, photos, items } = payload

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

    // Use a transaction-like approach: create sale, then items, then update draft
    // Note: Supabase doesn't support true transactions across multiple operations,
    // so we'll do them sequentially and handle errors

    // Write sale/items with admin (or RLS if policies allow)
    const admin = getAdminDb()

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
      is_featured: false
    }

    // 1. Create sale - write to base table using schema-scoped client
    const { data: saleRow, error: sErr } = await fromBase(admin, 'sales')
      .insert(salePayload)
      .select('id')
      .single()

    if (sErr) return fail(500, 'SALE_CREATE_FAILED', sErr.message, sErr)

    // Build itemsPayload
    // Include image_url (single string) - the database supports this column
    // Note: We don't include 'images' array because that column doesn't exist in the base table
    const itemsPayload = items && items.length > 0 ? items.map((item: any) => {
      const payload: any = {
        sale_id: saleRow.id,
        name: item.name,
        description: item.description || null,
        price: item.price || null,
        category: item.category || null,
      }
      
      // Include image_url if provided
      if (item.image_url) {
        payload.image_url = item.image_url
      }
      
      return payload
    }) : []

    // 2. Create items if any
    if (itemsPayload.length) {
      console.log('[DRAFT_PUBLISH] Creating items:', {
        saleId: saleRow.id,
        saleStatus: salePayload.status,
        itemsCount: itemsPayload.length,
        items: itemsPayload.map((i: any) => ({ name: i.name, hasImage: !!i.image_url })),
      })
      
      const { data: insertedItems, error: iErr } = await fromBase(admin, 'items')
        .insert(itemsPayload)
        .select('id, name, sale_id, image_url')
      
      if (iErr) {
        console.error('[DRAFT_PUBLISH] Failed to create items:', iErr)
        // Try to clean up the sale (best effort)
        await fromBase(admin, 'sales').delete().eq('id', saleRow.id)
        return fail(500, 'ITEMS_CREATE_FAILED', iErr.message, iErr)
      }
      
      console.log('[DRAFT_PUBLISH] Items created successfully:', {
        saleId: saleRow.id,
        itemsCreated: insertedItems?.length || 0,
        itemIds: insertedItems?.map((i: any) => i.id),
      })
      
      // Verify items are readable from base table (using admin client to bypass RLS for verification)
      // Note: admin client is schema-scoped to lootaura_v2, so we query the base table, not the view
      const { data: verifyItems, error: verifyErr } = await fromBase(admin, 'items')
        .select('id, name, sale_id, image_url')
        .eq('sale_id', saleRow.id)
      
      console.log('[DRAFT_PUBLISH] Items verification (admin client):', {
        saleId: saleRow.id,
        itemsFound: verifyItems?.length || 0,
        error: verifyErr,
        itemIds: verifyItems?.map((i: any) => i.id),
      })
    } else {
      console.log('[DRAFT_PUBLISH] No items to create for sale:', saleRow.id)
    }

    // 3. Delete the draft after successful publication (hard delete)
    // We delete instead of marking as 'published' since the sale is now live
    const { error: deleteErr } = await fromBase(rls, 'sale_drafts')
      .delete()
      .eq('id', draft.id)

    if (deleteErr) {
      // Sale and items are already created, so we'll log but not fail
      // The draft will remain but the sale is published, which is acceptable
      if (process.env.NODE_ENV !== 'production') console.error('[PUBLISH/POST] draft delete error:', deleteErr)
      Sentry.captureException(deleteErr, { tags: { operation: 'publishDraft', step: 'deleteDraft' } })
    } else {
      console.log('[PUBLISH/POST] Draft deleted successfully after publication:', {
        draftId: draft.id,
        draftKey: draft.draft_key,
        saleId: saleRow.id,
      })
    }

    return ok({ data: { saleId: saleRow.id } })
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') console.error('[PUBLISH/POST] thrown:', e)
    Sentry.captureException(e, { tags: { operation: 'publishDraft' } })
    return fail(500, 'PUBLISH_FAILED', e.message)
  }
}

