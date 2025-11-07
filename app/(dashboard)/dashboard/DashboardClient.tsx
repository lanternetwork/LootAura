'use client'

import { useEffect, useState } from 'react'
import DraftsPanel from '@/components/dashboard/DraftsPanel'
import SalesPanel from '@/components/dashboard/SalesPanel'
import AnalyticsPanel from '@/components/dashboard/AnalyticsPanel'
import type { DraftListing } from '@/lib/data/salesAccess'
import { Sale } from '@/lib/types'

export default function DashboardClient({ 
  initialSales,
  initialDrafts = []
}: { 
  initialSales: Sale[]
  initialDrafts?: DraftListing[]
}) {
  const [sales, setSales] = useState<Sale[]>(initialSales)
  const [drafts, setDrafts] = useState<DraftListing[]>(initialDrafts)
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [draftsError, setDraftsError] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [emailOptIn, setEmailOptIn] = useState(false)
  const [defaultRadiusKm, setDefaultRadiusKm] = useState<number>(10)

  const handleDraftDelete = (draftKey: string) => {
    setDrafts((prev) => prev.filter((d) => d.draft_key !== draftKey))
  }

  const handleDraftPublish = (_draftKey: string, _saleId: string) => {
    // Remove draft from list on successful publish
    setDrafts((prev) => prev.filter((d) => d.draft_key !== _draftKey))
    // Refresh sales to show the new sale
    fetch('/api/sales_v2?my_sales=true')
      .then(res => res.json())
      .then(data => {
        if (data.sales && Array.isArray(data.sales)) {
          setSales(data.sales as Sale[])
        }
      })
      .catch(err => console.error('[DASHBOARD_CLIENT] Error refreshing sales:', err))
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

  // If no sales from server, fetch from API (which works)
  useEffect(() => {
    console.log('[DASHBOARD_CLIENT] Initial sales received:', initialSales?.length || 0)
    if (initialSales && initialSales.length > 0) {
      console.log('[DASHBOARD_CLIENT] Sample sale:', initialSales[0])
    } else {
      console.warn('[DASHBOARD_CLIENT] No sales from server - fetching from API...')
      // Fetch sales directly from API (which successfully finds them)
      fetch('/api/sales_v2?my_sales=true')
        .then(res => res.json())
        .then(data => {
          console.log('[DASHBOARD_CLIENT] API response:', data)
          if (data.sales && Array.isArray(data.sales) && data.sales.length > 0) {
            console.log('[DASHBOARD_CLIENT] Found', data.sales.length, 'sales via API, updating state')
            setSales(data.sales as Sale[])
          } else {
            console.warn('[DASHBOARD_CLIENT] API returned no sales')
          }
        })
        .catch(err => console.error('[DASHBOARD_CLIENT] API fetch error:', err))
    }
  }, [initialSales])

  useEffect(() => {
    const loadSettings = async () => {
      const res = await fetch('/api/seller-settings')
      const j = await res.json()
      if (j?.ok && j.data) {
        setEmailOptIn(Boolean(j.data.email_opt_in))
        setDefaultRadiusKm(Number(j.data.default_radius_km ?? 10))
      }
    }
    loadSettings()
  }, [])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Seller Dashboard</h1>
      
      <div className="space-y-6">
        {/* Drafts Panel */}
        <DraftsPanel 
          drafts={drafts}
          isLoading={draftsLoading}
          error={draftsError}
          onDelete={handleDraftDelete}
          onPublish={handleDraftPublish}
          onRetry={handleRetryDrafts}
        />

        {/* Sales Panel */}
        <SalesPanel sales={sales} />

        {/* Analytics Panel */}
        <AnalyticsPanel />

        {/* Settings Panel */}
        <div className="card">
          <div className="card-body-lg">
            <h2 className="card-title mb-4">Settings</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!Number.isFinite(defaultRadiusKm) || defaultRadiusKm < 1 || defaultRadiusKm > 50) {
                  alert('Default radius must be between 1 and 50 km')
                  return
                }
                setSaving(true)
                const res = await fetch('/api/seller-settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email_opt_in: emailOptIn, default_radius_km: defaultRadiusKm }),
                })
                const j = await res.json()
                setSaving(false)
                if (!res.ok) {
                  alert(j?.error || 'Failed to save settings')
                  return
                }
                if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                  // eslint-disable-next-line no-console
                  console.log('[DASHBOARD] settings: upsert success')
                }
              }}
            >
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="rounded border-gray-300" checked={emailOptIn} onChange={(e) => setEmailOptIn(e.target.checked)} />
                  <span>Email me occasional tips and updates</span>
                </label>
                <div>
                  <label className="block text-sm font-medium mb-1">Default search radius (km)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={defaultRadiusKm}
                    onChange={(e) => setDefaultRadiusKm(Number(e.target.value))}
                    className="w-40 px-3 py-2 border rounded"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-accent" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button type="button" className="rounded px-4 py-2 border" onClick={() => { setEmailOptIn(false); setDefaultRadiusKm(10) }}>Reset</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}


