'use client'

import { useEffect, useState } from 'react'
import DraftsPanel from '@/components/dashboard/DraftsPanel'
import { publishDraftServer, deleteDraftServer } from '@/lib/draft/draftClient'
import type { DraftListing } from '@/lib/data/salesAccess'

type Listing = { id: string; title: string; updated_at?: string | null; status?: string | null; cover_image_url?: string | null; cover_url?: string | null }

export default function DashboardClient({ 
  initialListings,
  initialDrafts = []
}: { 
  initialListings: Listing[]
  initialDrafts?: DraftListing[]
}) {
  const [tab, setTab] = useState<'listings' | 'settings' | 'analytics'>('listings')
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [drafts, setDrafts] = useState<DraftListing[]>(initialDrafts)
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [draftsError, setDraftsError] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [emailOptIn, setEmailOptIn] = useState(false)
  const [defaultRadiusKm, setDefaultRadiusKm] = useState<number>(10)

  const handleDraftDelete = (draftKey: string) => {
    setDrafts((prev) => prev.filter((d) => d.draft_key !== draftKey))
  }

  const handleDraftPublish = (draftKey: string, saleId: string) => {
    // Remove draft from list on successful publish
    setDrafts((prev) => prev.filter((d) => d.draft_key !== draftKey))
    // Refresh listings to show the new sale
    fetch('/api/sales_v2?my_sales=true')
      .then(res => res.json())
      .then(data => {
        if (data.sales && Array.isArray(data.sales)) {
          const apiListings: Listing[] = data.sales.map((sale: any) => ({
            id: sale.id,
            title: sale.title,
            updated_at: sale.updated_at,
            status: sale.status,
            cover_image_url: sale.cover_image_url,
          }))
          setListings(apiListings)
        }
      })
      .catch(err => console.error('[DASHBOARD_CLIENT] Error refreshing listings:', err))
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

  // If no listings from server, fetch from API (which works)
  useEffect(() => {
    console.log('[DASHBOARD_CLIENT] Initial listings received:', initialListings?.length || 0)
    if (initialListings && initialListings.length > 0) {
      console.log('[DASHBOARD_CLIENT] Sample listing:', initialListings[0])
    } else {
      console.warn('[DASHBOARD_CLIENT] No listings from server - fetching from API...')
      // Fetch sales directly from API (which successfully finds them)
      fetch('/api/sales_v2?my_sales=true')
        .then(res => res.json())
        .then(data => {
          console.log('[DASHBOARD_CLIENT] API response:', data)
          if (data.sales && Array.isArray(data.sales) && data.sales.length > 0) {
            // Map API response to Listing format
            const apiListings: Listing[] = data.sales.map((sale: any) => ({
              id: sale.id,
              title: sale.title,
              updated_at: sale.updated_at,
              status: sale.status,
              cover_image_url: sale.cover_image_url,
            }))
            console.log('[DASHBOARD_CLIENT] Found', apiListings.length, 'sales via API, updating state')
            setListings(apiListings)
          } else {
            console.warn('[DASHBOARD_CLIENT] API returned no sales')
          }
        })
        .catch(err => console.error('[DASHBOARD_CLIENT] API fetch error:', err))
    }
  }, [initialListings])

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

  const listingsView = (
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

      {/* Sales Listings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Sales</h2>
          <a href="/sell/new" className="btn-accent">Create</a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((l) => (
            <div key={l.id} className="card card-hover">
              <div className="card-body">
                {(l.cover_url || l.cover_image_url) ? (
                  <div className="w-full h-32 rounded mb-3" style={{ backgroundImage: `url(${l.cover_url || l.cover_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                ) : null}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{l.title}</div>
                    <div className="text-xs text-gray-500">{l.updated_at ? new Date(l.updated_at).toLocaleString() : ''}</div>
                  </div>
                  <a href={`/sales/${l.id}`} className="link-accent text-sm">Edit</a>
                </div>
              </div>
            </div>
          ))}
          {listings.length === 0 && (
            <div className="text-gray-600">No listings yet.</div>
          )}
        </div>
      </div>
    </div>
  )

  const settingsView = (
    <form
      className="space-y-6"
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
      <div className="card">
        <div className="card-body-lg">
          <h3 className="card-title mb-4">Preferences</h3>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="rounded border-gray-300" checked={emailOptIn} onChange={(e) => setEmailOptIn(e.target.checked)} />
            <span>Email me occasional tips and updates</span>
          </label>
          <div className="mt-4">
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
          <div className="mt-6 flex gap-2">
            <button type="submit" className="btn-accent" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="rounded px-4 py-2 border" onClick={() => { setEmailOptIn(false); setDefaultRadiusKm(10) }}>Reset</button>
          </div>
        </div>
      </div>
    </form>
  )

  const analyticsView = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {['Views', 'Saves', 'CTR'].map((label) => (
        <div key={label} className="card">
          <div className="card-body">
            <div className="card-subtitle">{label}</div>
            <div className="text-2xl font-semibold mt-2">—</div>
            <div className="text-xs text-gray-500 mt-1">Coming soon</div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Seller Dashboard</h1>
      <div className="flex gap-2 mb-6">
        <button className={`px-3 py-1.5 rounded border ${tab==='listings' ? 'btn-accent' : ''}`} onClick={() => setTab('listings')}>Listings</button>
        <button className={`px-3 py-1.5 rounded border ${tab==='settings' ? 'btn-accent' : ''}`} onClick={() => setTab('settings')}>Settings</button>
        <button className={`px-3 py-1.5 rounded border ${tab==='analytics' ? 'btn-accent' : ''}`} onClick={() => setTab('analytics')}>Analytics</button>
      </div>
      {tab === 'listings' && listingsView}
      {tab === 'settings' && settingsView}
      {tab === 'analytics' && analyticsView}
    </div>
  )
}


