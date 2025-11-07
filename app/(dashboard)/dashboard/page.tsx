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
  // Query the base table directly (bypasses potential view RLS issues)
  // The sales_owner_read policy allows owners to read their own sales
  const { data: sales, error: listingsError } = await supabase
    .from('lootaura_v2.sales')
    .select('id, title, updated_at, status, cover_image_url')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20)
  
  // Map to Listing format
  const listings = sales?.map((sale: any) => ({
    id: sale.id,
    title: sale.title,
    updated_at: sale.updated_at,
    status: sale.status,
    cover_image_url: sale.cover_image_url,
  })) ?? []

  if (listingsError) {
    console.error('[DASHBOARD] Error fetching listings from base table:', listingsError)
    console.error('[DASHBOARD] Error code:', listingsError.code)
    console.error('[DASHBOARD] Error message:', listingsError.message)
    console.error('[DASHBOARD] Error details:', listingsError.details)
    console.error('[DASHBOARD] Error hint:', listingsError.hint)
    
    // Fallback: try the view (same as API endpoint)
    const { data: viewSales, error: viewError } = await supabase
      .from('sales_v2')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    
    if (viewError) {
      console.error('[DASHBOARD] Error fetching from view:', viewError)
      return (
        <DashboardClient initialListings={[]} />
      )
    }
    
    const viewListings = viewSales?.map((sale: any) => ({
      id: sale.id,
      title: sale.title,
      updated_at: sale.updated_at,
      status: sale.status,
      cover_image_url: sale.cover_image_url,
    })) ?? []
    
    console.log('[DASHBOARD] Fallback: Found', viewListings.length, 'listings from view')
    return (
      <DashboardClient initialListings={viewListings} />
    )
  }
  
  console.log('[DASHBOARD] Query successful, found', listings.length, 'listings from base table')
  if (listings.length > 0) {
    console.log('[DASHBOARD] Sample listing:', listings[0])
  } else {
    console.warn('[DASHBOARD] Query returned 0 results. User ID:', user.id)
    console.warn('[DASHBOARD] This suggests RLS is blocking the query or sales don\'t exist for this user')
  }

  return (
    <DashboardClient initialListings={listings ?? []} />
  )
}


