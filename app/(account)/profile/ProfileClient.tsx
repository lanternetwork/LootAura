'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IdentityCard } from '@/components/profile/IdentityCard'
import { AboutCard } from '@/components/profile/AboutCard'
import { PreferredCategories } from '@/components/profile/PreferredCategories'
import { OwnerMetrics } from '@/components/profile/OwnerMetrics'
import { OwnerListingsTabs } from '@/components/profile/OwnerListingsTabs'
import { PreferencesCard } from '@/components/profile/PreferencesCard'
import { AvatarUploader as AvatarUploaderComponent } from '@/components/profile/AvatarUploader'
import { getCsrfHeaders } from '@/lib/csrf-client'

type Profile = {
  id: string
  username?: string | null
  display_name?: string | null
  avatar_url?: string | null
  bio?: string | null
  location_city?: string | null
  location_region?: string | null
  created_at?: string | null
  verified?: boolean | null
}

type Listing = {
  id: string
  title: string
  cover_url?: string | null
  address?: string | null
  status: string
}

type Metrics = {
  views7d?: number
  saves7d?: number
  ctr7d?: number
  salesFulfilled?: number
}

export default function ProfileClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [preferredCategories, setPreferredCategories] = useState<string[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [listings, setListings] = useState<{ active: Listing[]; drafts: Listing[]; archived: Listing[] }>({
    active: [],
    drafts: [],
    archived: [],
  })
  const [error, setError] = useState<string | null>(null)
  const [showAvatarUploader, setShowAvatarUploader] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setLoading(true)
        // Load profile
        const profRes = await fetch('/api/profile')
        let p: any = null
        if (profRes.status === 404) {
          // Profile doesn't exist, create it
          const createRes = await fetch('/api/profile', { method: 'POST' })
          if (!createRes.ok) {
            const err = await createRes.json().catch(() => ({ error: 'Failed to create profile' }))
            const errorMsg = err?.error || 'Failed to create profile'
            const details = err?.details ? `: ${err.details}` : ''
            console.error('[PROFILE] Create failed:', errorMsg, details)
            throw new Error(`${errorMsg}${details}`)
          }
          p = await createRes.json()
        } else if (!profRes.ok) {
          const err = await profRes.json().catch(() => ({ error: 'Failed to load profile' }))
          const errorMsg = err?.error || 'Failed to load profile'
          const details = err?.details ? `: ${err.details}` : ''
          console.error('[PROFILE] Load failed:', errorMsg, details)
          throw new Error(`${errorMsg}${details}`)
        } else {
          p = await profRes.json()
        }
        if (!mounted) return
        
        // Handle both old and new response formats
        const profileData = p?.ok === true ? p.data : (p?.profile || p?.data || (p?.id ? p : null))
        if (profileData) {
          setProfile(profileData)
          // Load preferred categories via API
          try {
            const catsRes = await fetch(`/api/public/profile?username=${encodeURIComponent(profileData.id)}`)
            if (catsRes.ok) {
              const catsData = await catsRes.json()
              setPreferredCategories(catsData.preferred || [])
            }
          } catch (e) {
            console.error('Failed to load categories:', e)
          }
        } else {
          setError('Profile data not found')
        }

        // Load preferences
        const prefsRes = await fetch('/api/preferences')
        const prefs = await prefsRes.json().catch(() => ({}))
        if (prefs?.data) {
          setProfile((prev) => (prev ? { ...prev, preferences: prefs.data } : prev))
        }

        // Load metrics
        try {
          const metricsRes = await fetch('/api/profile/metrics')
          if (metricsRes.ok) {
            const metricsData = await metricsRes.json()
            setMetrics(metricsData)
          }
        } catch (e) {
          console.error('Failed to load metrics:', e)
        }

        // Load listings (active, drafts, archived)
        try {
          const [activeRes, draftsRes, archivedRes] = await Promise.all([
            fetch('/api/profile/listings?status=active&limit=50').catch(() => null),
            fetch('/api/profile/listings?status=drafts&limit=50').catch(() => null),
            fetch('/api/profile/listings?status=archived&limit=50').catch(() => null),
          ])
          const active = activeRes?.ok ? await activeRes.json().then((r: any) => r.items || []) : []
          const drafts = draftsRes?.ok ? await draftsRes.json().then((r: any) => r.items || []) : []
          const archived = archivedRes?.ok ? await archivedRes.json().then((r: any) => r.items || []) : []
          setListings({ active, drafts, archived })
        } catch (e) {
          console.error('Failed to load listings:', e)
        }
      } catch (e: any) {
        const errorMsg = e?.message || 'Failed to load profile'
        setError(errorMsg)
        console.error('[PROFILE] Load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])
  
  // Listen for cache revalidation events
  useEffect(() => {
    const handleSalesMutated = async () => {
      // Reload listings when sales are mutated
      try {
        const [activeRes, draftsRes, archivedRes] = await Promise.all([
          fetch('/api/profile/listings?status=active&limit=50'),
          fetch('/api/profile/listings?status=drafts&limit=50'),
          fetch('/api/profile/listings?status=archived&limit=50'),
        ])
        const active = activeRes.ok ? await activeRes.json().then((r: any) => r.items || []) : []
        const drafts = draftsRes.ok ? await draftsRes.json().then((r: any) => r.items || []) : []
        const archived = archivedRes.ok ? await archivedRes.json().then((r: any) => r.items || []) : []
        setListings({ active, drafts, archived })
      } catch (e) {
        // Ignore errors
      }
    }
    
    window.addEventListener('sales:mutated', handleSalesMutated)
    return () => {
      window.removeEventListener('sales:mutated', handleSalesMutated)
    }
  }, [])

  const handleAboutSave = async (data: { displayName?: string; bio?: string; locationCity?: string; locationRegion?: string }) => {
    console.log('[ABOUT] handleAboutSave called with keys:', Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined))
    
    // Build patch with only provided fields (no undefined -> null coercion)
    const patch: Record<string, any> = {}
    if (data.displayName !== undefined) patch.display_name = data.displayName
    if (data.bio !== undefined) patch.bio = data.bio
    if (data.locationCity !== undefined) patch.location_city = data.locationCity
    if (data.locationRegion !== undefined) patch.location_region = data.locationRegion
    
    console.log('[ABOUT] sending PUT /api/profile with keys:', Object.keys(patch))
    console.log('[ABOUT] PUT body:', JSON.stringify(patch))
    
    const csrfHeaders = getCsrfHeaders()
    console.log('[ABOUT] CSRF headers retrieved:', {
      hasCsrfHeader: !!csrfHeaders['x-csrf-token'],
      csrfTokenPrefix: csrfHeaders['x-csrf-token'] ? csrfHeaders['x-csrf-token'].substring(0, 8) + '...' : null,
      csrfTokenFull: csrfHeaders['x-csrf-token'] || 'MISSING',
      allHeaders: Object.keys(csrfHeaders),
      headersObject: csrfHeaders,
    })
    
    const requestHeaders = { 
      'Content-Type': 'application/json',
      ...csrfHeaders,
    }
    console.log('[ABOUT] Final request headers:', requestHeaders)
    
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: requestHeaders,
      body: JSON.stringify(patch),
    })
    
    console.log('[ABOUT] response ok=', res.ok, 'status=', res.status)
    console.log('[ABOUT] response headers:', Array.from(res.headers.entries()))
    
    if (!res.ok) {
      const errorText = await res.clone().text().catch(() => 'Unable to read error')
      console.error('[ABOUT] ✗ Error response:', {
        status: res.status,
        statusText: res.statusText,
        errorText: errorText.substring(0, 1000),
      })
    } else {
      console.log('[ABOUT] ✓ Success response')
    }
    
    // Read response once - don't read it twice!
    const j = await res.json().catch(() => ({ ok: false, error: 'Failed to parse response' }))
    
    console.log('[ABOUT] response j.ok=', j?.ok, 'error=', j?.error)
    console.log('[ABOUT] response data:', j?.data)
    console.log('[ABOUT] response bio in data:', j?.data?.bio)
    
    if (!res.ok || !j?.ok) {
      throw new Error(j?.error || 'Failed to save')
    }
    
    if (j?.data) {
      console.log('[ABOUT] updating local state with bio:', j.data.bio)
      setProfile((prev) => {
        const updated = prev ? {
          ...prev,
          display_name: j.data.display_name ?? data.displayName ?? prev.display_name,
          bio: j.data.bio ?? data.bio ?? prev.bio,
          location_city: j.data.location_city ?? data.locationCity ?? prev.location_city,
          location_region: j.data.location_region ?? data.locationRegion ?? prev.location_region,
        } : null
        console.log('[ABOUT] updated local state:', updated)
        return updated
      })
      
      console.log('[PROFILE] owner update success', { profileData: j.data })
    }
  }

  const handlePreferencesSave = async (theme: string, units: string) => {
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({ theme, units }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j?.error || 'Failed to save')
    }
  }

  const handleAvatarChange = () => {
    setShowAvatarUploader(true)
  }

  const handleAvatarUpdated = (url: string | null) => {
    // Update profile state with new avatar URL (may include cache bust param)
    setProfile((prev) => (prev ? { ...prev, avatar_url: url } : null))
    setShowAvatarUploader(false)
  }

  const handleViewPublic = () => {
    if (!profile) return
    
    // Use username if available, otherwise fallback to user_id
    // Only navigate if we have a valid identifier
    const slug = profile.username || profile.id
    
    if (!slug) {
      console.error('[PROFILE] Cannot navigate to public profile: no username or id')
      return
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PROFILE] navigate to public profile: /u/' + slug)
    }
    
    router.push(`/u/${encodeURIComponent(slug)}`)
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-neutral-600">Loading profile...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-neutral-600">Profile not found</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <IdentityCard
        profile={{
          id: profile.id,
          displayName: profile.display_name,
          username: profile.username,
          avatarUrl: profile.avatar_url ? `${profile.avatar_url}?v=${Date.now()}` : null,
          locationCity: profile.location_city,
          locationRegion: profile.location_region,
          createdAt: profile.created_at,
          verified: profile.verified,
        }}
        mode="owner"
        onAvatarChange={handleAvatarChange}
        onViewPublic={handleViewPublic}
      />

      {showAvatarUploader && (
        <div className="card">
          <div className="card-body-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="card-title">Change Avatar</h2>
              <button
                type="button"
                onClick={() => setShowAvatarUploader(false)}
                className="text-sm text-neutral-600 hover:text-neutral-900"
              >
                Close
              </button>
            </div>
            <AvatarUploaderComponent
              initialUrl={profile.avatar_url || undefined}
              onUpdated={handleAvatarUpdated}
              onClose={() => setShowAvatarUploader(false)}
            />
          </div>
        </div>
      )}

      <AboutCard
        bio={profile.bio || undefined}
        displayName={profile.display_name || undefined}
        locationCity={profile.location_city || undefined}
        locationRegion={profile.location_region || undefined}
        isEditable={true}
        onSave={handleAboutSave}
      />

      {preferredCategories.length > 0 && <PreferredCategories categories={preferredCategories} />}

      {metrics && <OwnerMetrics {...metrics} loading={false} />}

      <OwnerListingsTabs
        active={listings.active}
        drafts={listings.drafts}
        archived={listings.archived}
        onEdit={(id) => router.push(`/sell/edit/${id}`)}
        onArchive={async (id) => {
          try {
            const res = await fetch(`/api/sales/${id}/archive`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                ...getCsrfHeaders(),
              },
              body: JSON.stringify({ status: 'completed' }),
            })
            if (res.ok) {
              // Reload listings
              const [activeRes, archivedRes] = await Promise.all([
                fetch('/api/profile/listings?status=active&limit=50'),
                fetch('/api/profile/listings?status=archived&limit=50'),
              ])
              const active = activeRes.ok ? await activeRes.json().then((r: any) => r.items || []) : []
              const archived = archivedRes.ok ? await archivedRes.json().then((r: any) => r.items || []) : []
              setListings((prev) => ({ ...prev, active, archived }))
            }
          } catch (e) {
            console.error('Failed to archive:', e)
          }
        }}
        onUnarchive={async (id) => {
          try {
            const res = await fetch(`/api/sales/${id}/archive`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                ...getCsrfHeaders(),
              },
              body: JSON.stringify({ status: 'published' }),
            })
            if (res.ok) {
              // Reload listings
              const [activeRes, archivedRes] = await Promise.all([
                fetch('/api/profile/listings?status=active&limit=50'),
                fetch('/api/profile/listings?status=archived&limit=50'),
              ])
              const active = activeRes.ok ? await activeRes.json().then((r: any) => r.items || []) : []
              const archived = archivedRes.ok ? await archivedRes.json().then((r: any) => r.items || []) : []
              setListings((prev) => ({ ...prev, active, archived }))
            }
          } catch (e) {
            console.error('Failed to unarchive:', e)
          }
        }}
        onDelete={async (id) => {
          try {
            const res = await fetch(`/api/sales/${id}/delete`, { 
              method: 'DELETE',
              headers: {
                ...getCsrfHeaders(),
              },
            })
            if (res.ok) {
              // Reload listings
              const [activeRes, draftsRes, archivedRes] = await Promise.all([
                fetch('/api/profile/listings?status=active&limit=50'),
                fetch('/api/profile/listings?status=drafts&limit=50'),
                fetch('/api/profile/listings?status=archived&limit=50'),
              ])
              const active = activeRes.ok ? await activeRes.json().then((r: any) => r.items || []) : []
              const drafts = draftsRes.ok ? await draftsRes.json().then((r: any) => r.items || []) : []
              const archived = archivedRes.ok ? await archivedRes.json().then((r: any) => r.items || []) : []
              setListings({ active, drafts, archived })
            }
          } catch (e) {
            console.error('Failed to delete:', e)
          }
        }}
      />

      <PreferencesCard
        theme={(profile as any).preferences?.theme || 'system'}
        units={(profile as any).preferences?.units || 'imperial'}
        onSave={handlePreferencesSave}
      />
    </div>
  )
}
