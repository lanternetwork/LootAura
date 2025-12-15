import { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserSales, getUserDrafts, getArchivedSalesCount } from '@/lib/data/salesAccess'
import { getUserProfile, getUserMetrics7d } from '@/lib/data/profileAccess'
import DashboardClient from './DashboardClient'
import { createPageMetadata } from '@/lib/metadata'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = createPageMetadata({
  title: 'Dashboard',
  description: 'Manage your yard sales, view analytics, and track your listings.',
  path: '/dashboard',
})

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
  // Fetch active sales by default (for Live tab)
  // Also fetch archived count for tab badge
  const [salesResult, draftsResult, profile, metrics, archivedCount] = await Promise.all([
    getUserSales(supabase, user.id, { statusFilter: 'active', limit: 24 }),
    getUserDrafts(supabase, user.id, 12, 0),
    getUserProfile(supabase, user.id),
    getUserMetrics7d(supabase, user.id),
    getArchivedSalesCount(supabase, user.id),
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
      initialArchivedCount={archivedCount}
      promotionsEnabled={process.env.PROMOTIONS_ENABLED === 'true'}
      paymentsEnabled={process.env.PAYMENTS_ENABLED === 'true'}
    />
  )
}
