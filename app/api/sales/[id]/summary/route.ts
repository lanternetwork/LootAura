import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0 // Never cache - ensure fresh data after draft edits

/**
 * GET /api/sales/[id]/summary
 * Returns lightweight summary for checkout display: { title, city, state, photoUrl }
 * 
 * IMPORTANT: This endpoint must not be cached to ensure fresh data after draft edits.
 * Uses revalidate: 0 and cache: 'no-store' to prevent stale data.
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

    // Fetch only the fields we need from the public view
    const { data: sale, error } = await supabase
      .from('sales_v2')
      .select('title, city, state, cover_image_url')
      .eq('id', saleId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Sale not found' },
          { status: 404 }
        )
      }
      console.error('[SALES/SUMMARY] Error fetching sale:', error)
      return NextResponse.json(
        { error: 'Failed to fetch sale summary' },
        { status: 500 }
      )
    }

    if (!sale) {
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      )
    }

    // Return summary with photoUrl (use cover_image_url or placeholder)
    return NextResponse.json({
      title: sale.title || 'Untitled Sale',
      city: sale.city || '',
      state: sale.state || '',
      photoUrl: sale.cover_image_url || null,
    })
  } catch (error) {
    console.error('[SALES/SUMMARY] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
