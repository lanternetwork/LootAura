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
  // Try base table first (bypasses view RLS issues)
  console.log('[DASHBOARD] Fetching sales for user:', user.id)
  
  const { data: listings, error: listingsError } = await supabase
    .from('lootaura_v2.sales')
    .select('id, title, updated_at, status, cover_image_url')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (listingsError) {
    console.error('[DASHBOARD] Error fetching listings from base table:', listingsError)
    // Fallback: try sales_v2 view
    const { data: viewListings, error: viewError } = await supabase
      .from('sales_v2')
      .select('id, title, updated_at, status, cover_image_url')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    
    if (viewError) {
      console.error('[DASHBOARD] Error fetching listings from view:', viewError)
    } else {
      console.log('[DASHBOARD] Found', viewListings?.length || 0, 'listings from view')
    }
    
    return (
      <DashboardClient initialListings={viewListings ?? []} />
    )
  }

  console.log('[DASHBOARD] Found', listings?.length || 0, 'listings from base table')
  if (listings && listings.length > 0) {
    console.log('[DASHBOARD] Sample listing:', listings[0])
  }

  return (
    <DashboardClient initialListings={listings ?? []} />
  )
}


