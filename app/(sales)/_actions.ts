'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { T } from '@/lib/supabase/tables'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { normalizeItemImages } from '@/lib/data/itemImageNormalization'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'

// Zod schemas for validation
const SaleInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  starts_at: z.string().min(1, 'Start date is required'),
  ends_at: z.string().optional(),
  latitude: z.number().min(-90).max(90, 'Invalid latitude'),
  longitude: z.number().min(-180).max(180, 'Invalid longitude'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  categories: z.array(z.string()).optional(),
  cover_image_url: z.string().url().optional(),
  pricing_mode: z.enum(['negotiable', 'firm', 'best_offer', 'ask']).optional(),
})

const ItemInputSchema = z.object({
  title: z.string().min(1, 'Item title is required'),
  description: z.string().optional(),
  price_cents: z.number().min(0).optional(),
  image_url: z.string().url().optional(),
})

export type SaleInput = z.infer<typeof SaleInputSchema>
export type ItemInput = z.infer<typeof ItemInputSchema>

// Action result types
export type ActionResult<T = any> = {
  success: boolean
  data?: T
  error?: string
  fieldErrors?: Record<string, string[]>
}

// Helper function to get authenticated user
async function getAuthenticatedUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    throw new Error('Authentication required')
  }
  
  return { supabase, user }
}

// Sale actions
export async function createSale(input: SaleInput): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthenticatedUser()
    
    // Validate input
    const validatedInput = SaleInputSchema.parse(input)
    
    const { data, error } = await supabase
      .from(T.sales)
      .insert({
        owner_id: user.id,
        title: validatedInput.title,
        description: validatedInput.description,
        date_start: validatedInput.starts_at,
        date_end: validatedInput.ends_at,
        lat: validatedInput.latitude,
        lng: validatedInput.longitude,
        address: validatedInput.address,
        city: validatedInput.city,
        state: validatedInput.state,
        zip_code: validatedInput.zip,
        tags: validatedInput.categories,
        pricing_mode: validatedInput.pricing_mode || 'negotiable',
        status: 'draft',
        privacy_mode: 'exact',
        is_featured: false,
      })
      .select()
      .single()

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[SALES_ACTIONS] createSale error:', error)
      }
      return { success: false, error: 'Something went wrong while creating your sale. Please try again.' }
    }

    revalidatePath('/sales')
    revalidatePath('/sell')
    
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        fieldErrors: Object.fromEntries(
          Object.entries(error.flatten().fieldErrors).map(([key, value]) => [
            key, 
            value || []
          ])
        ) as Record<string, string[]>
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[SALES_ACTIONS] createSale exception:', error)
    }
    return { 
      success: false, 
      error: 'Something went wrong while creating your sale. Please try again.'
    }
  }
}

export async function updateSale(id: string, input: Partial<SaleInput>): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthenticatedUser()
    
    // Validate input
    const validatedInput = SaleInputSchema.partial().parse(input)
    
    const { data, error } = await supabase
      .from(T.sales)
      .update({
        title: validatedInput.title,
        description: validatedInput.description,
        date_start: validatedInput.starts_at,
        date_end: validatedInput.ends_at,
        lat: validatedInput.latitude,
        lng: validatedInput.longitude,
        address: validatedInput.address,
        city: validatedInput.city,
        state: validatedInput.state,
        zip_code: validatedInput.zip,
        tags: validatedInput.categories,
        pricing_mode: validatedInput.pricing_mode || 'negotiable',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_id', user.id) // Ensure user owns the sale
      .select()
      .single()

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[SALES_ACTIONS] createSale error:', error)
      }
      return { success: false, error: 'Something went wrong while creating your sale. Please try again.' }
    }

    revalidatePath('/sales')
    revalidatePath(`/sales/${id}`)
    revalidatePath('/sell')
    
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        fieldErrors: Object.fromEntries(
          Object.entries(error.flatten().fieldErrors).map(([key, value]) => [
            key, 
            value || []
          ])
        ) as Record<string, string[]>
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[SALES_ACTIONS] createSale exception:', error)
    }
    return { 
      success: false, 
      error: 'Something went wrong while creating your sale. Please try again.'
    }
  }
}

export async function deleteSale(id: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthenticatedUser()
    
    const { error } = await supabase
      .from(T.sales)
      .delete()
      .eq('id', id)
      .eq('owner_id', user.id) // Ensure user owns the sale

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[SALES_ACTIONS] createSale error:', error)
      }
      return { success: false, error: 'Something went wrong while creating your sale. Please try again.' }
    }

    revalidatePath('/sales')
    revalidatePath('/sell')
    
    return { success: true }
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[SALES_ACTIONS] createSale exception:', error)
    }
    return { 
      success: false, 
      error: 'Something went wrong while creating your sale. Please try again.'
    }
  }
}

// Item actions
export async function createItem(saleId: string, input: ItemInput): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthenticatedUser()
    
    // Validate input
    const validatedInput = ItemInputSchema.parse(input)
    
    // First verify the user owns the sale
    const { data: sale, error: saleError } = await supabase
      .from(T.sales)
      .select('id')
      .eq('id', saleId)
      .eq('owner_id', user.id)
      .single()

    if (saleError || !sale) {
      return { success: false, error: 'Sale not found or access denied' }
    }
    
    // Normalize image fields to canonical format (images array + image_url for compatibility)
    const normalizedImages = normalizeItemImages({
      image_url: validatedInput.image_url,
      images: undefined, // This action only accepts image_url
    })
    
    // Write to base table using schema-scoped client (base table is authoritative)
    const db = await getRlsDb()
    const { data, error } = await fromBase(db, 'items')
      .insert({
        sale_id: saleId,
        name: validatedInput.title,
        description: validatedInput.description,
        price: validatedInput.price_cents ? validatedInput.price_cents / 100 : null,
        // Always set both fields for consistency (base table is authoritative)
        images: normalizedImages.images,
        image_url: normalizedImages.image_url,
      })
      .select()
      .single()

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[SALES_ACTIONS] createSale error:', error)
      }
      return { success: false, error: 'Something went wrong while creating your sale. Please try again.' }
    }

    revalidatePath(`/sales/${saleId}`)
    revalidatePath('/sell')
    
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        fieldErrors: Object.fromEntries(
          Object.entries(error.flatten().fieldErrors).map(([key, value]) => [
            key, 
            value || []
          ])
        ) as Record<string, string[]>
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[SALES_ACTIONS] createSale exception:', error)
    }
    return { 
      success: false, 
      error: 'Something went wrong while creating your sale. Please try again.'
    }
  }
}

export async function deleteItem(id: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthenticatedUser()
    
    // First get the item to verify ownership through the sale
    const { data: item, error: itemError } = await supabase
      .from(T.items)
      .select(`
        id,
        sales!inner (
          id,
          owner_id
        )
      `)
      .eq('id', id)
      .single()

    if (itemError || !item) {
      return { success: false, error: 'Item not found' }
    }

    // Check if user owns the sale
    if (item.sales[0]?.owner_id !== user.id) {
      return { success: false, error: 'Access denied' }
    }
    
    const { error } = await supabase
      .from(T.items)
      .delete()
      .eq('id', id)

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[SALES_ACTIONS] createSale error:', error)
      }
      return { success: false, error: 'Something went wrong while creating your sale. Please try again.' }
    }

    revalidatePath('/sales')
    revalidatePath('/sell')
    
    return { success: true }
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[SALES_ACTIONS] createSale exception:', error)
    }
    return { 
      success: false, 
      error: 'Something went wrong while creating your sale. Please try again.'
    }
  }
}

// Favorite actions
export async function toggleFavorite(saleId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthenticatedUser()
    
    // Check if already favorited
    const { data: existing } = await supabase
      .from(T.favorites)
      .select('*')
      .eq('user_id', user.id)
      .eq('sale_id', saleId)
      .single()

    if (existing) {
      // Remove from favorites
      const { error } = await supabase
        .from(T.favorites)
        .delete()
        .eq('user_id', user.id)
        .eq('sale_id', saleId)

      if (error) {
        return { success: false, error: error.message }
      }

      revalidatePath('/favorites')
      revalidatePath(`/sales/${saleId}`)
      
      return { success: true, data: { favorited: false } }
    } else {
      // Add to favorites
      const { error } = await supabase
        .from(T.favorites)
        .insert({
          user_id: user.id,
          sale_id: saleId,
        })

      if (error) {
        return { success: false, error: error.message }
      }

      revalidatePath('/favorites')
      revalidatePath(`/sales/${saleId}`)
      
      return { success: true, data: { favorited: true } }
    }
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[SALES_ACTIONS] createSale exception:', error)
    }
    return { 
      success: false, 
      error: 'Something went wrong while creating your sale. Please try again.'
    }
  }
}
