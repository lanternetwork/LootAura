'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ProfileSummaryCard,
  type ProfileCardStatus,
} from '@/components/dashboard/ProfileSummaryCard'
import SalesPanel from '@/components/dashboard/SalesPanel'
import AnalyticsPanel from '@/components/dashboard/AnalyticsPanel'
import AccountLockedBanner from '@/components/account/AccountLockedBanner'
import { useProfile } from '@/lib/hooks/useAuth'
import { getCsrfHeaders } from '@/lib/csrf-client'
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
  const router = useRouter()
  const [sales, setSales] = useState<Sale[]>(initialSales)
  const [drafts, setDrafts] = useState<DraftListing[]>(initialDrafts)
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [draftsError, setDraftsError] = useState<any>(null)
  const [recoveryAttempted, setRecoveryAttempted] = useState(false)
  const [recovering, setRecovering] = useState(false)

  const {
    data: clientProfile,
    isLoading: profileLoading,
    isError: profileError,
    error: profileErrorDetail,
    refetch: refetchProfile,
  } = useProfile()

  const profile = clientProfile ?? initialProfile ?? null

  const runProfileRecovery = useCallback(async () => {
    setRecovering(true)
    try {
      await fetch('/api/profile', {
        method: 'POST',
        credentials: 'include',
        headers: getCsrfHeaders(),
      })
      await refetchProfile()
      router.refresh()
    } finally {
      setRecovering(false)
      setRecoveryAttempted(true)
    }
  }, [refetchProfile, router])

  useEffect(() => {
    if (profileLoading || profile || profileError || recoveryAttempted || recovering) {
      return
    }
    void runProfileRecovery()
  }, [
    profileLoading,
    profile,
    profileError,
    recoveryAttempted,
    recovering,
    runProfileRecovery,
  ])

  const profileCardStatus: ProfileCardStatus = useMemo(() => {
    if (profile) return 'ready'
    if (profileError) return 'error'
    if (profileLoading || recovering) return 'loading'
    if (!recoveryAttempted) return 'loading'
    return 'missing'
  }, [profile, profileError, profileLoading, recovering, recoveryAttempted])

  const handleDraftDelete = (draftKey: string) => {
    setDrafts((prev) => prev.filter((d) => d.draft_key !== draftKey))
  }

  const handleDraftPublish = (_draftKey: string, _saleId: string) => {
    setDrafts((prev) => prev.filter((d) => d.draft_key !== _draftKey))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sales:mutated', { detail: { type: 'create', id: _saleId } }))
    }
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
    } catch {
      setDraftsError({ message: 'Network error. Please try again.' })
    } finally {
      setDraftsLoading(false)
    }
  }

  const handleProfileRetry = () => {
    setRecoveryAttempted(false)
    void runProfileRecovery()
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Seller Dashboard</h1>
      </div>

      {clientProfile?.is_locked && (
        <AccountLockedBanner lockReason={clientProfile.lock_reason || undefined} />
      )}

      <div className="space-y-6">
        <ProfileSummaryCard
          profile={profileCardStatus === 'ready' ? profile : null}
          status={profileCardStatus}
          onRetry={handleProfileRetry}
          errorMessage={
            profileErrorDetail instanceof Error ? profileErrorDetail.message : null
          }
        />

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

        <AnalyticsPanel metrics7d={initialMetrics || null} />
      </div>
    </div>
  )
}
