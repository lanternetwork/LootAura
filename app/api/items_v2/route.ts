// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { normalizeItemImages } from '@/lib/data/itemImageNormalization'
import { z } from 'zod'

// Validation schema for item creation/update
// Accepts both 'name' and 'title' for backward compatibility (normalized to 'title' internally)
const ItemV2InputSchema = z.object({
  sale_id: z.string().min(1, 'Sale ID is required'),
  title: z.string().min(1, 'Item title is required').optional(),
  name: z.string().min(1, 'Item name is required').optional(),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be a non-negative number').optional(),
  category: z.string().optional(),
  condition: z.string().optional(),
  image_url: z.string().url().optional(),
  images: z.array(z.string()).optional(),
}).refine((data) => data.title || data.name, {
  message: 'Either title or name is required',
  path: ['title'],
})

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    // Get query parameters
    const sale_id = searchParams.get('sale_id')
    const my_items = searchParams.get('my_items')
    
    let query = supabase
      .from('items_v2')
      .select('*')
    
    // If my_items is true, filter by authenticated user
    if (my_items === 'true') {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      query = query.eq('owner_id', user.id)
    } else if (sale_id) {
      // Filter by sale_id for public access
      query = query.eq('sale_id', sale_id)
    }
    
    const { data: items, error } = await query
    
    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.error('Error fetching items', error instanceof Error ? error : new Error(String(error)), {
          component: 'items_v2',
          operation: 'GET',
          errorCode: error.code,
        })
      }
      return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
    }
    
    return NextResponse.json({ items })
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.error('Unexpected error in items_v2 GET', error instanceof Error ? error : new Error(String(error)), {
        component: 'items_v2',
        operation: 'GET',
      })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const supabase = createSupabaseServerClient()
    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    
    // Validate request body
    const validationResult = ItemV2InputSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
      return NextResponse.json({ 
        error: 'Validation failed',
        details: errors
      }, { status: 400 })
    }
    
    const validatedBody = validationResult.data
    
    // Normalize name/title: accept both 'name' and 'title', prefer 'title', fallback to 'name'
    // The refine ensures at least one exists, so this will never be empty
    const itemTitle = (validatedBody.title ?? validatedBody.name) as string
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }
    
    // Write to base table using schema-scoped client
    const db = getRlsDb()
    
    // Validate that the sale belongs to the authenticated user
    // Read from base table to check ownership (sales_v2 view doesn't include owner_id for security)
    const { data: sale, error: saleError } = await fromBase(db, 'sales')
      .select('id, owner_id')
      .eq('id', validatedBody.sale_id)
      .single()
    
    if (saleError || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }
    
    if (sale.owner_id !== user.id) {
      return NextResponse.json({ error: 'You can only create items for your own sales' }, { status: 400 })
    }
    
    // Normalize image fields to canonical format (images array + image_url for compatibility)
    const normalizedImages = normalizeItemImages({
      image_url: validatedBody.image_url,
      images: validatedBody.images,
    })
    
    // Build insert payload with normalized image fields
    const insertPayload: any = {
      sale_id: validatedBody.sale_id,
      name: itemTitle,
      description: validatedBody.description,
      price: validatedBody.price,
      category: validatedBody.category,
      condition: validatedBody.condition,
      // Always set both fields for consistency (base table is authoritative)
      images: normalizedImages.images,
      image_url: normalizedImages.image_url,
    }
    
    // Log for debugging (only in debug mode)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.debug('[ITEMS_V2] Creating item with image data', {
        component: 'items_v2',
        operation: 'POST',
        hasImageUrl: !!validatedBody.image_url,
        hasImages: Array.isArray(validatedBody.images) && validatedBody.images.length > 0,
        imagesCount: Array.isArray(validatedBody.images) ? validatedBody.images.length : 0,
        normalizedImages: normalizedImages.images?.length || 0,
        normalizedImageUrl: normalizedImages.image_url ? `${normalizedImages.image_url.substring(0, 50)}...` : null,
      })
    }
    
    const { data: item, error } = await fromBase(db, 'items')
      .insert(insertPayload)
      .select()
      .single()
    
    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.error('Error creating item', error instanceof Error ? error : new Error(String(error)), {
          component: 'items_v2',
          operation: 'POST',
          errorCode: error.code,
        })
      }
      return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
    }
    
    // Enqueue image post-processing job for item image (non-blocking, non-critical)
    if (normalizedImages.image_url) {
      // Import logger once if debug mode is enabled
      const logger = process.env.NEXT_PUBLIC_DEBUG === 'true' 
        ? (await import('@/lib/log')).logger
        : null
      
      try {
        const { enqueueJob, JOB_TYPES } = await import('@/lib/jobs')
        enqueueJob(JOB_TYPES.IMAGE_POSTPROCESS, {
          imageUrl: normalizedImages.image_url!,
          saleId: validatedBody.sale_id,
          ownerId: user.id,
        }).catch((err) => {
          // Log but don't fail - job enqueueing is non-critical (debug only)
          if (logger) {
            logger.debug('[ITEMS_V2] Failed to enqueue image post-processing job (non-critical)', {
              component: 'items_v2',
              operation: 'POST',
              error: err instanceof Error ? err.message : String(err),
            })
          }
        })
      } catch (jobErr) {
        // Ignore job enqueueing errors - this is non-critical (debug only)
        if (logger) {
          logger.debug('[ITEMS_V2] Failed to enqueue image post-processing job (non-critical)', {
            component: 'items_v2',
            operation: 'POST',
            error: jobErr instanceof Error ? jobErr.message : String(jobErr),
          })
        }
      }
    }
    
    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.error('Unexpected error in items_v2 POST', error instanceof Error ? error : new Error(String(error)), {
        component: 'items_v2',
        operation: 'POST',
      })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const supabase = createSupabaseServerClient()
    const { pathname } = new URL(request.url)
    const itemId = pathname.split('/').pop()
    
    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }
    
    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    
    // Validate request body (all fields optional for updates)
    const UpdateItemV2InputSchema = ItemV2InputSchema.partial().extend({
      sale_id: z.string().optional(), // sale_id should not be updated
    })
    const validationResult = UpdateItemV2InputSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
      return NextResponse.json({ 
        error: 'Validation failed',
        details: errors
      }, { status: 400 })
    }
    
    const validatedBody = validationResult.data
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }
    
    // Normalize image fields if present in update body
    const updatePayload: any = {}
    // Normalize name/title: accept both 'name' and 'title', prefer 'title', fallback to 'name'
    if (validatedBody.title !== undefined || validatedBody.name !== undefined) {
      updatePayload.name = (validatedBody.title ?? validatedBody.name) as string
    }
    if (validatedBody.description !== undefined) {
      updatePayload.description = validatedBody.description
    }
    if (validatedBody.price !== undefined) {
      updatePayload.price = validatedBody.price
    }
    if (validatedBody.category !== undefined) {
      updatePayload.category = validatedBody.category
    }
    if (validatedBody.condition !== undefined) {
      updatePayload.condition = validatedBody.condition
    }
    if (validatedBody.image_url !== undefined || validatedBody.images !== undefined) {
      const normalizedImages = normalizeItemImages({
        image_url: validatedBody.image_url,
        images: validatedBody.images,
      })
      // Always set both fields for consistency (base table is authoritative)
      updatePayload.images = normalizedImages.images
      updatePayload.image_url = normalizedImages.image_url
    }
    
    // Write to base table using schema-scoped client
    const db = getRlsDb()
    const { data: item, error } = await fromBase(db, 'items')
      .update(updatePayload)
      .eq('id', itemId)
      .select()
      .single()
    
    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.error('Error updating item', error instanceof Error ? error : new Error(String(error)), {
          component: 'items_v2',
          operation: 'PUT',
          itemId,
          errorCode: error.code,
        })
      }
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
    }
    
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }
    
    return NextResponse.json({ item })
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.error('Unexpected error in items_v2 PUT', error instanceof Error ? error : new Error(String(error)), {
        component: 'items_v2',
        operation: 'PUT',
      })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const supabase = createSupabaseServerClient()
    const { pathname } = new URL(request.url)
    const itemId = pathname.split('/').pop()
    
    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }
    
    // Write to base table using schema-scoped client
    const db = getRlsDb()
    const { error } = await fromBase(db, 'items')
      .delete()
      .eq('id', itemId)
    
    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.error('Error deleting item', error instanceof Error ? error : new Error(String(error)), {
          component: 'items_v2',
          operation: 'DELETE',
          itemId,
          errorCode: error.code,
        })
      }
      return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.error('Unexpected error in items_v2 DELETE', error instanceof Error ? error : new Error(String(error)), {
        component: 'items_v2',
        operation: 'DELETE',
      })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
