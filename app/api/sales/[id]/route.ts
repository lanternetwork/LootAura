import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSaleWithItems } from '@/lib/data/salesAccess'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/sales/[id]
 * Returns full sale data with items for mobile app
 * Public endpoint - uses RLS policies for access control
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient()
    const saleId = params.id

    if (!saleId) {
      return NextResponse.json(
        { error: 'Sale ID is required' },
        { status: 400 }
      )
    }

    // Use existing getSaleWithItems function which handles RLS and owner info
    const result = await getSaleWithItems(supabase, saleId)

    if (!result) {
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      )
    }

    const { sale, items } = result

    // Return sale data without owner_id for security (public API)
    const publicSale = {
      id: sale.id,
      title: sale.title,
      description: sale.description,
      address: sale.address,
      city: sale.city,
      state: sale.state,
      zip_code: sale.zip_code,
      lat: sale.lat,
      lng: sale.lng,
      date_start: sale.date_start,
      time_start: sale.time_start,
      date_end: sale.date_end,
      time_end: sale.time_end,
      price: sale.price,
      tags: sale.tags,
      cover_image_url: sale.cover_image_url,
      images: sale.images,
      archived_at: sale.archived_at,
      status: sale.status,
      privacy_mode: sale.privacy_mode,
      is_featured: sale.is_featured,
      pricing_mode: sale.pricing_mode,
      created_at: sale.created_at,
      updated_at: sale.updated_at,
      // Include owner profile info (public fields only)
      owner_profile: sale.owner_profile ? {
        id: sale.owner_profile.id,
        display_name: sale.owner_profile.full_name, // full_name is mapped from display_name in getSaleWithItems
        username: sale.owner_profile.username,
        avatar_url: sale.owner_profile.avatar_url,
        created_at: sale.owner_profile.created_at,
      } : null,
      owner_stats: sale.owner_stats,
    }

    return NextResponse.json({
      sale: publicSale,
      items: items || [],
    })
  } catch (error) {
    console.error('[SALES/ID] Error fetching sale:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
