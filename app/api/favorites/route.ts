/**
 * Favorites API - Handle user favorites
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSchema } from '@/lib/supabase/schema'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

/**
 * GET /api/favorites - Get user favorites
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get schema-aware table name
    const schema = getSchema()
    const favoritesTable = schema === 'public' ? 'favorites_v2' : 'favorites'

    // Get user's favorites
    const { data: favorites, error } = await supabase
      .from(favoritesTable)
      .select('*')
      .eq('user_id', user.id)

    if (error) {
      console.error('Failed to fetch favorites:', error)
      return NextResponse.json(
        { error: 'Failed to fetch favorites' },
        { status: 500 }
      )
    }

    return NextResponse.json({ favorites })
  } catch (error) {
    console.error('Favorites API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/favorites - Add a favorite
 */
async function postHandler(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const body = await request.json()
    const { sale_id } = body

    if (!sale_id) {
      return NextResponse.json(
        { error: 'Sale ID is required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }

    // Get schema-aware table name
    const schema = getSchema()
    const favoritesTable = schema === 'public' ? 'favorites_v2' : 'favorites'

    // Add favorite
    const { data: favorite, error } = await supabase
      .from(favoritesTable)
      .insert({
        user_id: user.id,
        sale_id: sale_id
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to add favorite:', error)
      return NextResponse.json(
        { error: 'Failed to add favorite' },
        { status: 500 }
      )
    }

    return NextResponse.json({ favorite })
  } catch (error) {
    console.error('Favorites API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/favorites - Remove a favorite
 */
async function deleteHandler(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const { searchParams } = new URL(request.url)
    const sale_id = searchParams.get('sale_id')

    if (!sale_id) {
      return NextResponse.json(
        { error: 'Sale ID is required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }

    // Get schema-aware table name
    const schema = getSchema()
    const favoritesTable = schema === 'public' ? 'favorites_v2' : 'favorites'

    // Remove favorite
    const { error } = await supabase
      .from(favoritesTable)
      .delete()
      .eq('user_id', user.id)
      .eq('sale_id', sale_id)

    if (error) {
      console.error('Failed to remove favorite:', error)
      return NextResponse.json(
        { error: 'Failed to remove favorite' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Favorites API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withRateLimit(postHandler, [Policies.MUTATE_MINUTE])
export const DELETE = withRateLimit(deleteHandler, [Policies.MUTATE_MINUTE])
