'use client'

import { useState } from 'react'
import { ProfileSummaryCard } from '@/components/dashboard/ProfileSummaryCard'
import SalesPanel from '@/components/dashboard/SalesPanel'
import AnalyticsPanel from '@/components/dashboard/AnalyticsPanel'
import AccountLockedBanner from '@/components/account/AccountLockedBanner'
import { useProfile } from '@/lib/hooks/useAuth'
import type { DraftListing } from '@/lib/data/salesAccess'
import type { ProfileData, Metrics7d } from '@/lib/data/profileAccess'
import { Sale } from '@/lib/types'

interface DashboardClientProps {
  initialSales: Sale[]
  initialDrafts?: DraftListing[]
  initialProfile?: ProfileData | null
  initialMetrics?: Metrics7d | null
  initialArchivedCount?: number
  promotionsEnabled?: boolean
  paymentsEnabled?: boolean
}

export default function DashboardClient({
  initialSales,
  initialDrafts = [],
  initialProfile,
  initialMetrics,
  initialArchivedCount = 0,
  promotionsEnabled = false,
  paymentsEnabled = false,
}: DashboardClientProps) {
  const [sales, setSales] = useState<Sale[]>(initialSales)
  const [drafts, setDrafts] = useState<DraftListing[]>(initialDrafts)
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [draftsError, setDraftsError] = useState<any>(null)

  const handleDraftDelete = (draftKey: string) => {
    setDrafts((prev) => prev.filter((d) => d.draft_key !== draftKey))
  }

  const handleDraftPublish = (_draftKey: string, _saleId: string) => {
    // Remove draft from list on successful publish
    setDrafts((prev) => prev.filter((d) => d.draft_key !== _draftKey))
    // Emit revalidation event to trigger page refresh
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sales:mutated', { detail: { type: 'create', id: _saleId } }))
    }
    // Sales will be refreshed via server-side revalidation on next navigation
  }

  const handleRetryDrafts = async () => {
    setDraftsLoading(true)
    setDraftsError(null)
    try {
      const response = await fetch('/api/drafts?all=true')
      const result = await response.json()
      if (result.ok && Array.isArray(result.data)) {
        const mappedDrafts: DraftListing[] = result.data.map((draft: any) => ({
          id: draft.id,
          draft_key: draft.draft_key,
          title: draft.title || draft.payload?.formData?.title || null,
          updated_at: draft.updated_at,
          payload: draft.payload || {},
        }))
        setDrafts(mappedDrafts)
      } else {
        setDraftsError({ message: result.error || 'Failed to load drafts' })
      }
    } catch (error) {
      setDraftsError({ message: 'Network error. Please try again.' })
    } finally {
      setDraftsLoading(false)
    }
  }

  const { data: profile } = useProfile()

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Seller Dashboard</h1>
      </div>

      {/* Account Locked Banner */}
      {profile?.is_locked && (
        <AccountLockedBanner lockReason={profile.lock_reason || undefined} />
      )}

      <div className="space-y-6">
        {/* Row 1: Profile Summary (read-only with Edit Profile button) */}
        <ProfileSummaryCard profile={initialProfile || null} />

        {/* Row 3: Sales Panel (with Live, Archived, and Drafts tabs) */}
        <SalesPanel
          initialArchivedCount={initialArchivedCount} 
          sales={sales}
          drafts={drafts}
          isLoadingDrafts={draftsLoading}
          draftsError={draftsError}
          promotionsEnabled={promotionsEnabled}
          paymentsEnabled={paymentsEnabled}
          onSaleDelete={(saleId) => {
            setSales((prev) => prev.filter((s) => s.id !== saleId))
          }}
          onDraftDelete={handleDraftDelete}
          onDraftPublish={handleDraftPublish}
          onRetryDrafts={handleRetryDrafts}
        />

        {/* Row 4: Analytics */}
        <AnalyticsPanel metrics7d={initialMetrics || null} />
      </div>
    </div>
  )
}
