// NOTE: Writes → lootaura_v2.* only. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { SaleDraftPayloadSchema } from '@/lib/validation/saleDraft'
import { isAllowedImageUrl } from '@/lib/images/validateImageUrl'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

type ApiResponse<T = any> = {
  ok: boolean
  data?: T
  error?: string
  code?: string
  details?: string
}

// POST: Publish draft (transactional: create sale + items, mark draft as published)
export async function POST(request: NextRequest) {
  try {
    const { createSupabaseWriteClient } = await import('@/lib/supabase/server')
    const supabase = createSupabaseWriteClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }, { status: 401 })
    }

    let body: any
    try {
      body = await request.json()
    } catch (error) {
      console.error('[DRAFTS_PUBLISH] JSON parse error:', {
        error: error instanceof Error ? error.message : String(error)
      })
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Invalid JSON in request body',
        code: 'INVALID_JSON'
      }, { status: 400 })
    }
    
    const { draftKey } = body

    if (!draftKey || typeof draftKey !== 'string') {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'draftKey is required',
        code: 'INVALID_INPUT'
      }, { status: 400 })
    }

    // Fetch draft by user_id + draft_key with status active
    const { data: draft, error: fetchError } = await supabase
      .from('sale_drafts')
      .select('id, payload, status')
      .eq('user_id', user.id)
      .eq('draft_key', draftKey)
      .eq('status', 'active')
      .single()

    if (fetchError || !draft) {
      console.error('[DRAFTS_PUBLISH] Error fetching draft:', {
        fetchError: fetchError ? {
          code: fetchError.code,
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint
        } : null,
        draftKey,
        userId: user.id,
        hasDraft: !!draft
      })
      
      // Check if already published (idempotency)
      const { data: publishedDraft } = await supabase
        .from('sale_drafts')
        .select('id')
        .eq('user_id', user.id)
        .eq('draft_key', draftKey)
        .eq('status', 'published')
        .maybeSingle()

      if (publishedDraft) {
        // Find the sale that was created from this draft
        // We'll need to track this - for now, return error asking to republish
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: 'Draft already published',
          code: 'ALREADY_PUBLISHED'
        }, { status: 400 })
      }

      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Draft not found',
        code: 'DRAFT_NOT_FOUND',
        details: fetchError?.message || 'Draft may not have been saved successfully'
      }, { status: 404 })
    }

    // Validate payload
    const validationResult = SaleDraftPayloadSchema.safeParse(draft.payload)
    if (!validationResult.success) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Invalid draft payload',
        code: 'VALIDATION_ERROR'
      }, { status: 400 })
    }

    const payload = validationResult.data
    const { formData, photos, items } = payload

    // Validate required fields
    if (!formData.title || !formData.city || !formData.state || !formData.date_start || !formData.time_start) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Missing required fields',
        code: 'MISSING_FIELDS'
      }, { status: 400 })
    }

    // Validate image URLs
    const allImages = photos || []
    if (allImages.length > 0) {
      for (const imageUrl of allImages) {
        if (!isAllowedImageUrl(imageUrl)) {
          return NextResponse.json<ApiResponse>({
            ok: false,
            error: `Invalid image URL: ${imageUrl}`,
            code: 'INVALID_IMAGE_URL'
          }, { status: 400 })
        }
      }
    }

    // Validate item image URLs
    for (const item of items || []) {
      if (item.image_url && !isAllowedImageUrl(item.image_url)) {
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: `Invalid item image URL: ${item.image_url}`,
          code: 'INVALID_IMAGE_URL'
        }, { status: 400 })
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
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Location (lat/lng) is required',
        code: 'MISSING_LOCATION'
      }, { status: 400 })
    }
    const lat = formData.lat
    const lng = formData.lng

    // Use a transaction-like approach: create sale, then items, then update draft
    // Note: Supabase doesn't support true transactions across multiple operations,
    // so we'll do them sequentially and handle errors

    // 1. Create sale
    const { data: sale, error: saleError } = await supabase
      .from('lootaura_v2.sales')
      .insert({
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
      })
      .select('id')
      .single()

    if (saleError || !sale) {
      console.error('[DRAFTS] Error creating sale:', saleError)
      Sentry.captureException(saleError, { tags: { operation: 'publishDraft', step: 'createSale' } })
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Failed to create sale',
        code: 'SALE_CREATE_ERROR'
      }, { status: 500 })
    }

    // 2. Create items
    if (items && items.length > 0) {
      const itemsToInsert = items.map(item => ({
        sale_id: sale.id,
        name: item.name,
        description: item.description || null,
        price: item.price || null,
        category: item.category || null,
        image_url: item.image_url || null,
        // Also populate images array for compatibility with items_v2 view
        images: item.image_url ? [item.image_url] : null
      }))

      const { error: itemsError } = await supabase
        .from('lootaura_v2.items')
        .insert(itemsToInsert)

      if (itemsError) {
        console.error('[DRAFTS] Error creating items:', itemsError)
        // Try to clean up the sale (best effort)
        await supabase.from('lootaura_v2.sales').delete().eq('id', sale.id)
        Sentry.captureException(itemsError, { tags: { operation: 'publishDraft', step: 'createItems' } })
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: 'Failed to create items',
          code: 'ITEMS_CREATE_ERROR'
        }, { status: 500 })
      }
    }

    // 3. Mark draft as published
    const { error: updateError } = await supabase
      .from('lootaura_v2.sale_drafts')
      .update({ status: 'published' })
      .eq('id', draft.id)

    if (updateError) {
      console.error('[DRAFTS] Error updating draft status:', updateError)
      // Sale and items are already created, so we'll log but not fail
      Sentry.captureException(updateError, { tags: { operation: 'publishDraft', step: 'updateDraft' } })
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { saleId: sale.id }
    })
  } catch (error) {
    console.error('[DRAFTS] Unexpected error in publish:', error)
    Sentry.captureException(error, { tags: { operation: 'publishDraft' } })
    return NextResponse.json<ApiResponse>({
      ok: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}

