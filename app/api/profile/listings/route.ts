import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'active'
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const from = (page - 1) * limit
  const to = from + limit - 1
  
  // Map status to database values: 'active' -> 'published', 'archived' -> 'archived', 'drafts' -> 'draft'
  const statusMap: Record<string, string> = {
    active: 'published',
    archived: 'archived',
    drafts: 'draft',
  }
  const dbStatus = statusMap[status] || status
  
  // For archived sales, filter by 1-year retention (archived_at >= now() - 1 year)
  // OR if archived_at is NULL, use date_end >= now() - 1 year as fallback
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  // Use ISO timestamp for consistent server/client comparison (not just date string)
  const oneYearAgoISO = oneYearAgo.toISOString()
  
  let query = supabase
    .from('sales_v2')
    .select('id, title, cover_image_url, images, address, status, owner_id, archived_at, date_end', { count: 'exact' })
    .eq('owner_id', user.id)
    .eq('status', dbStatus)
  
  // Apply 1-year retention filter for archived sales
  if (dbStatus === 'archived') {
    // Use OR to match either archived_at or date_end within 1 year
    // Use ISO timestamp to match client-side filtering logic
    query = query.or(`archived_at.gte.${oneYearAgoISO},date_end.gte.${oneYearAgoISO}`)
  }
  
  query = query.order('created_at', { ascending: false }).range(from, to)
  
  const { data, error, count } = await query
  
  if (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE LISTINGS] GET error:', error, { status: dbStatus, userId: user.id })
    }
    
    // If error is about missing columns, try with minimal columns
    if (error.message?.includes('column') || error.message?.includes('not found')) {
      const { data: minimalData, error: minimalError } = await supabase
        .from('sales_v2')
        .select('id, title, status, owner_id, archived_at, date_end', { count: 'exact' })
        .eq('owner_id', user.id)
        .eq('status', dbStatus)
        .order('created_at', { ascending: false })
        .range(from, to)
      
      if (!minimalError) {
        // Apply 1-year retention filter for archived sales
        let filteredData = minimalData || []
        if (dbStatus === 'archived') {
          const oneYearAgo = new Date()
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
          filteredData = filteredData.filter((item: any) => {
            // Keep if archived_at is within 1 year, or if archived_at is null but date_end is within 1 year
            if (item.archived_at) {
              return new Date(item.archived_at) >= oneYearAgo
            }
            if (item.date_end) {
              return new Date(item.date_end) >= oneYearAgo
            }
            // If neither exists, exclude (shouldn't happen for archived sales)
            return false
          })
        }
        
        return NextResponse.json({
          items: filteredData,
          total: filteredData.length,
          page,
          hasMore: to + 1 < filteredData.length,
        })
      }
    }
    
    return NextResponse.json({ ok: false, code: 'FETCH_ERROR', error: 'Failed to fetch listings' }, { status: 500 })
  }
  
  // For archived sales, the 1-year filter is already applied server-side
  // But we still need to filter client-side for edge cases (null values, etc.)
  let filteredData = data || []
  if (dbStatus === 'archived') {
    filteredData = filteredData.filter((item: any) => {
      // Keep if archived_at is within 1 year, or if archived_at is null but date_end is within 1 year
      if (item.archived_at) {
        return new Date(item.archived_at) >= oneYearAgo
      }
      if (item.date_end) {
        return new Date(item.date_end) >= oneYearAgo
      }
      // If neither exists, exclude (shouldn't happen for archived sales)
      return false
    })
  }
  
  // Use count from query if available, otherwise use filtered length
  // For archived, the count might be approximate due to client-side filtering
  const totalCount = count !== null ? count : filteredData.length
  
  return NextResponse.json({
    items: filteredData,
    total: totalCount,
    page,
    hasMore: to + 1 < totalCount,
  })
}
