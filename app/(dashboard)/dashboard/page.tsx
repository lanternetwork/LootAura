import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserSales } from '@/lib/data/salesAccess'
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

  // Fetch all sales for the user using data access helper
  // Prefers view, falls back to base table automatically
  const { data: listings, source, error } = await getUserSales(supabase, user.id, 20)

  if (error) {
    console.error('[DASHBOARD] Error fetching listings:', error)
    return (
      <DashboardClient initialListings={[]} />
    )
  }

  if (source === 'base_table') {
    // Log fallback usage for observability
    console.warn('[DASHBOARD] Using base-table fallback. View may need attention.')
  }

  console.log('[DASHBOARD] Query successful, found', listings.length, 'listings (source:', source, ')')
  if (listings.length > 0) {
    console.log('[DASHBOARD] Sample listing:', listings[0])
  }

  return (
    <DashboardClient initialListings={listings} />
  )
}


