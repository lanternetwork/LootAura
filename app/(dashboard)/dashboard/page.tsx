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
  // Replicate the EXACT query from the working API endpoint
  // The API endpoint uses sales_v2 view with select('*') and owner_id filter
  let query = supabase
    .from('sales_v2')
    .select('*')
  
  // Filter by owner_id (same as API endpoint)
  query = query.eq('owner_id', user.id)
  
  // Add ordering and limit for dashboard
  query = query.order('updated_at', { ascending: false })
  query = query.limit(20)
  
  const { data: sales, error: listingsError } = await query
  
  // Map to Listing format
  const listings = sales?.map((sale: any) => ({
    id: sale.id,
    title: sale.title,
    updated_at: sale.updated_at,
    status: sale.status,
    cover_image_url: sale.cover_image_url,
  })) ?? []

  if (listingsError) {
    console.error('[DASHBOARD] Error fetching listings:', listingsError)
    console.error('[DASHBOARD] Error code:', listingsError.code)
    console.error('[DASHBOARD] Error message:', listingsError.message)
    console.error('[DASHBOARD] Error details:', listingsError.details)
    console.error('[DASHBOARD] Error hint:', listingsError.hint)
    
    // If query fails, return empty array (client will fetch from API)
    return (
      <DashboardClient initialListings={[]} />
    )
  }
  
  console.log('[DASHBOARD] Query successful, found', listings.length, 'listings')
  if (listings.length > 0) {
    console.log('[DASHBOARD] Sample listing:', listings[0])
  } else if (sales && sales.length === 0) {
    console.warn('[DASHBOARD] Query returned 0 results. User ID:', user.id)
    console.warn('[DASHBOARD] This suggests RLS is blocking the query or sales don\'t exist for this user')
  }

  return (
    <DashboardClient initialListings={listings ?? []} />
  )
}


