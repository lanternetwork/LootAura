import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { Sale } from '@/lib/types'

// Zod schemas for validation
const SaleInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip_code: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  date_start: z.string().min(1, 'Start date is required'),
  time_start: z.string().min(1, 'Start time is required'),
  date_end: z.string().optional(),
  time_end: z.string().optional(),
  duration_hours: z.number().min(1).max(24).optional(),
  price: z.number().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'completed', 'cancelled', 'archived']).default('draft'),
  privacy_mode: z.enum(['exact', 'block_until_24h']).default('exact'),
  is_featured: z.boolean().default(false),
  pricing_mode: z.enum(['negotiable', 'firm', 'best_offer', 'ask']).optional(),
})

const ItemInputSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  description: z.string().optional(),
  price: z.number().optional(),
  category: z.string().optional(),
  condition: z.string().optional(),
  images: z.array(z.string()).default([]),
  is_sold: z.boolean().default(false),
})

const GetSalesParamsSchema = z.object({
  city: z.string().optional(),
  distanceKm: z.number().default(25),
  lat: z.number().optional(),
  lng: z.number().optional(),
  dateRange: z.enum(['today', 'weekend', 'next_weekend', 'any']).optional(),
  categories: z.array(z.string()).optional(),
  limit: z.number().default(50),
  offset: z.number().default(0),
})

// TypeScript types
// Sale type is imported from @/lib/types

export type Item = {
  id: string
  sale_id: string
  name: string
  description?: string
  price?: number
  category?: string
  condition?: string
  images: string[]
  is_sold: boolean
  created_at: string
  updated_at: string
}

export type GetSalesParams = z.infer<typeof GetSalesParamsSchema>
export type SaleInput = z.infer<typeof SaleInputSchema>
export type ItemInput = z.infer<typeof ItemInputSchema>

// Utility functions for distance calculation and display
export function metersToMiles(meters: number): number {
  return meters * 0.000621371
}

export function metersToKilometers(meters: number): number {
  return meters / 1000
}

export function formatDistance(meters: number, unit: 'miles' | 'km' = 'miles'): string {
  if (unit === 'miles') {
    const miles = metersToMiles(meters)
    return miles < 1 ? `${Math.round(miles * 10) / 10} mi` : `${Math.round(miles)} mi`
  } else {
    const km = metersToKilometers(meters)
    return km < 1 ? `${Math.round(km * 10) / 10} km` : `${Math.round(km)} km`
  }
}

// Helper function to get date range based on dateRange parameter
function getDateRange(dateRange?: 'today' | 'weekend' | 'next_weekend' | 'any') {
  if (!dateRange || dateRange === 'any') return null
  
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  
  if (dateRange === 'today') {
    return { start: todayStr, end: todayStr }
  }
  
  if (dateRange === 'weekend') {
    const dayOfWeek = today.getDay()
    const daysUntilSaturday = (6 - dayOfWeek) % 7
    const daysUntilSunday = (7 - dayOfWeek) % 7
    
    const saturday = new Date(today)
    saturday.setDate(today.getDate() + daysUntilSaturday)
    
    const sunday = new Date(today)
    sunday.setDate(today.getDate() + daysUntilSunday)
    
    return {
      start: saturday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0]
    }
  }
  
  if (dateRange === 'next_weekend') {
    const dayOfWeek = today.getDay()
    const daysUntilSaturday = ((6 - dayOfWeek) % 7) + 7
    const daysUntilSunday = ((7 - dayOfWeek) % 7) + 7
    
    const saturday = new Date(today)
    saturday.setDate(today.getDate() + daysUntilSaturday)
    
    const sunday = new Date(today)
    sunday.setDate(today.getDate() + daysUntilSunday)
    
    return {
      start: saturday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0]
    }
  }
  
  return null
}

// Data functions
export async function getSales(params: GetSalesParams = { distanceKm: 25, limit: 50, offset: 0 }) {
  try {
    const validatedParams = GetSalesParamsSchema.parse(params)
    const supabase = createSupabaseServerClient()
    
    // Get date range constraints
    const dateConstraints = getDateRange(validatedParams.dateRange)
    
    // If lat/lng provided, use PostGIS spatial query
    if (validatedParams.lat && validatedParams.lng) {
      const distanceMeters = validatedParams.distanceKm * 1000
      
      // Use PostGIS function for accurate distance filtering and sorting
      const { data: spatialData, error: spatialError } = await supabase
        .rpc('search_sales_within_distance', {
          user_lat: validatedParams.lat,
          user_lng: validatedParams.lng,
          distance_meters: distanceMeters,
          search_city: validatedParams.city || null,
          search_categories: validatedParams.categories || null,
          date_start_filter: dateConstraints?.start || null,
          date_end_filter: dateConstraints?.end || null,
          limit_count: validatedParams.limit
        })

      if (spatialError) {
        console.error('Spatial query error:', spatialError)
        throw new Error('Failed to perform spatial search')
      }

      return spatialData as Sale[]
    }
    
    // Fallback to regular query without distance filtering
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    let query = supabase
      .from('sales_v2')
      .select('*')
      .in('status', ['published', 'active'])
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(validatedParams.limit)
      .range(validatedParams.offset, validatedParams.offset + validatedParams.limit - 1)

    // Filter by city
    if (validatedParams.city) {
      query = query.ilike('city', `%${validatedParams.city}%`)
    }

    // Filter by categories/tags
    if (validatedParams.categories && validatedParams.categories.length > 0) {
      query = query.overlaps('tags', validatedParams.categories)
    }

    // Filter by date range
    if (dateConstraints) {
      query = query
        .gte('date_start', dateConstraints.start)
        .lte('date_start', dateConstraints.end)
    } else {
      // "Any time" means current/future only
      query = query.or(
        `date_end.gte.${todayStr},and(date_end.is.null,date_start.gte.${todayStr})`
      )
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching sales:', error)
      throw new Error('Failed to fetch sales')
    }

    return data as Sale[]
  } catch (error) {
    console.error('Error in getSales:', error)
    throw error
  }
}

export interface SaleWithOwnerInfo extends Sale {
  owner_profile?: {
    id?: string
    created_at?: string | null
    full_name?: string | null
    username?: string | null
    avatar_url?: string | null
  } | null
  owner_stats?: {
    user_id?: string
    total_sales?: number | null
    last_sale_at?: string | null
    avg_rating?: number | null
    ratings_count?: number | null
  } | null
}

export async function getSaleById(id: string): Promise<SaleWithOwnerInfo | null> {
  try {
    const supabase = createSupabaseServerClient()
    
    const { data: sale, error: saleError } = await supabase
      .from('sales_v2')
      .select('*')
      .eq('id', id)
      .single()

    if (saleError) {
      if (saleError.code === 'PGRST116') {
        return null // No rows returned
      }
      console.error('[SALES] Error fetching sale:', saleError)
      throw new Error('Failed to fetch sale')
    }

    if (!sale || !sale.owner_id) {
      console.error('[SALES] Sale found but missing owner_id')
      return {
        ...sale,
        owner_profile: null,
        owner_stats: {
          total_sales: 0,
          avg_rating: 5.0,
          ratings_count: 0,
          last_sale_at: null,
        },
      } as SaleWithOwnerInfo
    }

    const ownerId = sale.owner_id

    // Fetch owner profile and stats in parallel.
    // NOTE: The primary user-facing name field in v2 is `display_name` (used by profile pages).
    // To keep seller details in sync with the profile UI without changing downstream components,
    // we read `display_name` here and map it into `full_name` in the returned `owner_profile`.
    const [profileRes, statsRes] = await Promise.all([
      supabase
        .from('profiles_v2')
        .select('id, created_at, display_name, username, avatar_url')
        .eq('id', ownerId)
        .maybeSingle(),
      supabase
        .from('owner_stats')
        .select('user_id, total_sales, last_sale_at, avg_rating, ratings_count')
        .eq('user_id', ownerId)
        .maybeSingle(),
    ])

    // Log errors but don't fail - return with defaults
    if (profileRes.error) {
      const { logger } = await import('@/lib/log')
      logger.error('Error fetching owner profile', profileRes.error instanceof Error ? profileRes.error : new Error(String(profileRes.error)), {
        component: 'sales',
        operation: 'getSaleById',
        ownerId,
      })
    }
    if (statsRes.error) {
      const { logger } = await import('@/lib/log')
      logger.error('Error fetching owner stats', statsRes.error instanceof Error ? statsRes.error : new Error(String(statsRes.error)), {
        component: 'sales',
        operation: 'getSaleById',
        ownerId,
      })
    }

    const ownerProfileRaw = profileRes.data as
      | { id?: string; created_at?: string | null; display_name?: string | null; username?: string | null; avatar_url?: string | null }
      | null

    const ownerProfile = ownerProfileRaw
      ? {
          id: ownerProfileRaw.id,
          created_at: ownerProfileRaw.created_at,
          // Map display_name -> full_name so existing UI (SellerActivityCard) picks up the updated name
          full_name: ownerProfileRaw.display_name ?? null,
          username: ownerProfileRaw.username ?? null,
          avatar_url: ownerProfileRaw.avatar_url ?? null,
        }
      : null

    return {
      ...sale,
      owner_profile: ownerProfile,
      owner_stats: statsRes.data ?? {
        total_sales: 0,
        avg_rating: 5.0,
        ratings_count: 0,
        last_sale_at: null,
      },
    } as SaleWithOwnerInfo
  } catch (error) {
    const { logger } = await import('@/lib/log')
    logger.error('Error in getSaleById', error instanceof Error ? error : new Error(String(error)), {
      component: 'sales',
      operation: 'getSaleById',
    })
    throw error
  }
}

export async function createSale(input: SaleInput): Promise<Sale> {
  try {
    const validatedInput = SaleInputSchema.parse(input)
    const supabase = createSupabaseServerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { data, error } = await supabase
      .from('sales')
      .insert({
        owner_id: user.id,
        ...validatedInput,
        pricing_mode: validatedInput.pricing_mode || 'negotiable',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating sale:', error)
      throw new Error('Failed to create sale')
    }

    return data as Sale
  } catch (error) {
    console.error('Error in createSale:', error)
    throw error
  }
}

export async function updateSale(id: string, input: Partial<SaleInput>): Promise<Sale> {
  try {
    const validatedInput = SaleInputSchema.partial().parse(input)
    const supabase = createSupabaseServerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { data, error } = await supabase
      .from('sales')
      .update({
        ...validatedInput,
        pricing_mode: validatedInput.pricing_mode || 'negotiable',
      })
      .eq('id', id)
      .eq('owner_id', user.id) // Ensure user owns the sale
      .select()
      .single()

    if (error) {
      console.error('Error updating sale:', error)
      throw new Error('Failed to update sale')
    }

    return data as Sale
  } catch (error) {
    console.error('Error in updateSale:', error)
    throw error
  }
}

export async function deleteSale(id: string): Promise<void> {
  try {
    const supabase = createSupabaseServerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id)
      .eq('owner_id', user.id) // Ensure user owns the sale

    if (error) {
      console.error('Error deleting sale:', error)
      throw new Error('Failed to delete sale')
    }
  } catch (error) {
    console.error('Error in deleteSale:', error)
    throw error
  }
}

export async function listItems(saleId: string): Promise<Item[]> {
  try {
    const supabase = createSupabaseServerClient()
    
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching items:', error)
      throw new Error('Failed to fetch items')
    }

    return data as Item[]
  } catch (error) {
    console.error('Error in listItems:', error)
    throw error
  }
}

export async function createItem(saleId: string, input: ItemInput): Promise<Item> {
  try {
    const validatedInput = ItemInputSchema.parse(input)
    const supabase = createSupabaseServerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Verify user owns the sale
    const sale = await getSaleById(saleId)
    if (!sale || sale.owner_id !== user.id) {
      throw new Error('Unauthorized to add items to this sale')
    }

    const { data, error } = await supabase
      .from('items')
      .insert({
        sale_id: saleId,
        ...validatedInput,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating item:', error)
      throw new Error('Failed to create item')
    }

    return data as Item
  } catch (error) {
    console.error('Error in createItem:', error)
    throw error
  }
}

export async function toggleFavorite(saleId: string): Promise<{ is_favorited: boolean }> {
  try {
    const supabase = createSupabaseServerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Check if already favorited
    const { data: existingFavorite } = await supabase
      .from('favorites')
      .select('id')
      .eq('sale_id', saleId)
      .eq('user_id', user.id)
      .single()

    if (existingFavorite) {
      // Remove from favorites
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('sale_id', saleId)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error removing favorite:', error)
        throw new Error('Failed to remove favorite')
      }

      return { is_favorited: false }
    } else {
      // Add to favorites
      const { error } = await supabase
        .from('favorites')
        .insert({
          sale_id: saleId,
          user_id: user.id,
        })

      if (error) {
        console.error('Error adding favorite:', error)
        throw new Error('Failed to add favorite')
      }

      return { is_favorited: true }
    }
  } catch (error) {
    console.error('Error in toggleFavorite:', error)
    throw error
  }
}
