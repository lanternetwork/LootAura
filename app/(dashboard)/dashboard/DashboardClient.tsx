'use client'

import { useState, useEffect } from 'react'
import { ProfileSummaryCard } from '@/components/dashboard/ProfileSummaryCard'
import SocialLinksCard from '@/components/dashboard/SocialLinksCard'
import SalesPanel from '@/components/dashboard/SalesPanel'
import AnalyticsPanel from '@/components/dashboard/AnalyticsPanel'
import type { DraftListing } from '@/lib/data/salesAccess'
import type { ProfileData, Metrics7d } from '@/lib/data/profileAccess'
import { Sale } from '@/lib/types'
import { FaPlus } from 'react-icons/fa'
import Link from 'next/link'

interface DashboardClientProps {
  initialSales: Sale[]
  initialDrafts?: DraftListing[]
  initialProfile?: ProfileData | null
  initialMetrics?: Metrics7d | null
}

export default function DashboardClient({
  initialSales,
  initialDrafts = [],
  initialProfile,
  initialMetrics,
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
    // Emit revalidation event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sales:mutated', { detail: { type: 'create', id: _saleId } }))
    }
    // Refresh sales to show the new sale
    fetch('/api/sales_v2?my_sales=true')
      .then((res) => res.json())
      .then((data) => {
        if (data.sales && Array.isArray(data.sales)) {
          setSales(data.sales as Sale[])
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[DASHBOARD_CLIENT] Error refreshing sales:', err)
        }
      })
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


  // If no sales from server, fetch from API (fallback)
  useEffect(() => {
    if (initialSales && initialSales.length > 0) {
      return // Server data is good
    }

    // Fallback: fetch from API
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[DASHBOARD_CLIENT] No sales from server - fetching from API...')
    }
    fetch('/api/sales_v2?my_sales=true')
      .then((res) => res.json())
      .then((data) => {
        if (data.sales && Array.isArray(data.sales) && data.sales.length > 0) {
          setSales(data.sales as Sale[])
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[DASHBOARD_CLIENT] API fetch error:', err)
        }
      })
  }, [initialSales])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Seller Dashboard</h1>
        <Link href="/sell/new" className="btn-accent flex items-center gap-1 text-sm">
          <FaPlus className="w-4 h-4" />
          New Sale
        </Link>
      </div>

      <div className="space-y-6">
        {/* Row 1: Profile Summary */}
        <ProfileSummaryCard profile={initialProfile || null} />

        {/* Row 2: Social Links */}
        <SocialLinksCard initial={initialProfile?.social_links || null} />

        {/* Row 3: Sales Panel (with Live, Archived, and Drafts tabs) */}
        <SalesPanel 
          sales={sales}
          drafts={drafts}
          isLoadingDrafts={draftsLoading}
          draftsError={draftsError}
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
