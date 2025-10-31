import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    // Get last 10 sales with cover_image_url and images fields
    const { data: recentSales, error: salesError } = await supabase
      .from('sales_v2')
      .select('id, title, cover_image_url, images, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (salesError) {
      console.error('Error fetching recent sales:', salesError)
      return NextResponse.json({ 
        error: 'Failed to fetch sales data' 
      }, { status: 500 })
    }
    
    // Calculate stats
    const totalSales = recentSales?.length || 0
    const salesWithCoverImage = recentSales?.filter(sale => sale.cover_image_url).length || 0
    const salesWithImages = recentSales?.filter(sale => sale.images && Array.isArray(sale.images) && sale.images.length > 0).length || 0
    const salesUsingPlaceholder = totalSales - salesWithCoverImage
    
    // Calculate placeholder percentage
    const placeholderPercentage = totalSales > 0 
      ? Math.round((salesUsingPlaceholder / totalSales) * 100) 
      : 0
    
    return NextResponse.json({
      ok: true,
      stats: {
        total: totalSales,
        withCoverImage: salesWithCoverImage,
        withImages: salesWithImages,
        usingPlaceholder: salesUsingPlaceholder,
        placeholderPercentage
      },
      sales: recentSales || []
    })
  } catch (error: any) {
    console.error('Images stats error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error?.message 
    }, { status: 500 })
  }
}

