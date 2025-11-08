import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserSales, getUserDrafts } from '@/lib/data/salesAccess'
import { getUserProfile, getUserMetrics7d, getUserPreferences } from '@/lib/data/profileAccess'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h1 className="text-xl font-semibold">Please sign in</h1>
        <p className="text-gray-600 mt-2">You need to be authenticated to access the dashboard.</p>
      </div>
    )
  }

  // Fetch all data in parallel via SSR helpers
  const [salesResult, draftsResult, profile, metrics, preferences] = await Promise.all([
    getUserSales(supabase, user.id, 24),
    getUserDrafts(supabase, user.id, 12, 0),
    getUserProfile(supabase, user.id),
    getUserMetrics7d(supabase, user.id),
    getUserPreferences(supabase, user.id),
  ])

  const sales = salesResult.data || []
  const drafts = draftsResult.data || []

  // Log fallback usage for observability (dev only)
  if (process.env.NODE_ENV !== 'production' && salesResult.source === 'base_table') {
    // eslint-disable-next-line no-console
    console.warn('[DASHBOARD] Using base-table fallback for sales. View may need attention.')
  }

  return (
    <DashboardClient
      initialSales={sales}
      initialDrafts={drafts}
      initialProfile={profile}
      initialMetrics={metrics}
      initialPreferences={preferences}
    />
  )
}
