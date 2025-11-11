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
    // Also try to include images array if the column exists (will be handled gracefully by the API)
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
      
      // Also try to include images array if provided (for future compatibility)
      // The items_v2 API route will handle this gracefully
      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        payload.images = item.images
      } else if (item.image_url) {
        // Convert single image_url to images array for compatibility
        payload.images = [item.image_url]
      }
      
      return payload
    }) : []

    // 2. Create items if any
    if (itemsPayload.length) {
      const { error: iErr } = await fromBase(admin, 'items').insert(itemsPayload)
      if (iErr) {
        // Try to clean up the sale (best effort)
        await fromBase(admin, 'sales').delete().eq('id', saleRow.id)
        return fail(500, 'ITEMS_CREATE_FAILED', iErr.message, iErr)
      }
    }

    // 3. Mark draft as published
    const { error: uErr } = await fromBase(rls, 'sale_drafts')
      .update({ status: 'published' })
      .eq('id', draft.id)

    if (uErr) {
      // Sale and items are already created, so we'll log but not fail
      if (process.env.NODE_ENV !== 'production') console.error('[PUBLISH/POST] draft update error:', uErr)
      Sentry.captureException(uErr, { tags: { operation: 'publishDraft', step: 'updateDraft' } })
    }

    return ok({ data: { saleId: saleRow.id } })
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') console.error('[PUBLISH/POST] thrown:', e)
    Sentry.captureException(e, { tags: { operation: 'publishDraft' } })
    return fail(500, 'PUBLISH_FAILED', e.message)
  }
}

