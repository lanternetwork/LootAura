import { createSupabaseServerClient } from '@/lib/supabase/server'
import { T } from '@/lib/supabase/tables'
import { z } from 'zod'
import { Sale } from '@/lib/types'

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
  price: z.number().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'completed', 'cancelled']).default('draft'),
  privacy_mode: z.enum(['exact', 'block_until_24h']).default('exact'),
  is_featured: z.boolean().default(false),
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
    let query = supabase
      .from('sales_v2')
      .select('*')
      .eq('status', 'published')
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

export async function getSaleById(id: string): Promise<Sale | null> {
  try {
    const supabase = createSupabaseServerClient()
    
    const { data, error } = await supabase
      .from('sales_v2')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // No rows returned
      }
      console.error('Error fetching sale:', error)
      throw new Error('Failed to fetch sale')
    }

    return data as Sale
  } catch (error) {
    console.error('Error in getSaleById:', error)
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
      .from('lootaura_v2.sales')
      .insert({
        owner_id: user.id,
        ...validatedInput,
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
      .from('lootaura_v2.sales')
      .update(validatedInput)
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
      .from('lootaura_v2.sales')
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
      .from(T.items)
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
      .from(T.items)
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
      .from(T.favorites)
      .select('id')
      .eq('sale_id', saleId)
      .eq('user_id', user.id)
      .single()

    if (existingFavorite) {
      // Remove from favorites
      const { error } = await supabase
        .from(T.favorites)
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
        .from(T.favorites)
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
