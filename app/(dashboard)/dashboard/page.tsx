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
  // Use sales_v2 view which should have proper RLS policies
  // If that fails, we'll add error logging
  const { data: listings, error: listingsError } = await supabase
    .from('sales_v2')
    .select('id, title, updated_at, status, cover_image_url')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (listingsError) {
    console.error('[DASHBOARD] Error fetching listings:', listingsError)
    // Fallback: try querying base table directly
    const { data: fallbackListings } = await supabase
      .from('lootaura_v2.sales')
      .select('id, title, updated_at, status, cover_image_url')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    
    return (
      <DashboardClient initialListings={fallbackListings ?? []} />
    )
  }

  return (
    <DashboardClient initialListings={listings ?? []} />
  )
}


