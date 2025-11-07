import { createSupabaseServerClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Let middleware handle redirect if configured; otherwise simple message
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-xl font-semibold">Please sign in</h1>
        <p className="text-gray-600 mt-2">You need to be authenticated to access the dashboard.</p>
      </div>
    )
  }

  // Fetch all sales for the user (including published, draft, etc.)
  // Use the same approach as the API endpoint that works: sales_v2 view
  console.log('[DASHBOARD] Fetching sales for user:', user.id)
  
  // Use sales_v2 view (same as API endpoint /api/sales_v2?my_sales=true)
  // The view includes owner_id and works correctly
  const { data: listings, error: listingsError } = await supabase
    .from('sales_v2')
    .select('id, title, updated_at, status, cover_image_url')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (listingsError) {
    console.error('[DASHBOARD] Error fetching listings from view:', listingsError)
    console.error('[DASHBOARD] Error details:', JSON.stringify(listingsError, null, 2))
    
    // Fallback: try base table
    const { data: baseListings, error: baseError } = await supabase
      .from('lootaura_v2.sales')
      .select('id, title, updated_at, status, cover_image_url')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    
    if (baseError) {
      console.error('[DASHBOARD] Error fetching listings from base table:', baseError)
    } else {
      console.log('[DASHBOARD] Found', baseListings?.length || 0, 'listings from base table')
    }
    
    return (
      <DashboardClient initialListings={baseListings ?? []} />
    )
  }

  console.log('[DASHBOARD] Found', listings?.length || 0, 'listings from view')
  if (listings && listings.length > 0) {
    console.log('[DASHBOARD] Sample listing:', listings[0])
  }

  return (
    <DashboardClient initialListings={listings ?? []} />
  )
}


