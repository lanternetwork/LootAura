'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IdentityCard } from '@/components/profile/IdentityCard'
import { AboutCard } from '@/components/profile/AboutCard'
import { PreferredCategories } from '@/components/profile/PreferredCategories'
import { OwnerMetrics } from '@/components/profile/OwnerMetrics'
import { OwnerListingsTabs } from '@/components/profile/OwnerListingsTabs'
import { PreferencesCard } from '@/components/profile/PreferencesCard'

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
          const createRes = await fetch('/api/profile', { method: 'POST' })
          p = await createRes.json()
        } else {
          p = await profRes.json()
        }
        if (!mounted) return
        const profileData = p?.profile || p?.data || (p?.id ? p : null)
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
          setProfile({ id: 'me' } as Profile)
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
      } catch (e) {
        setError('Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const handleBioSave = async (bio: string) => {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j?.error || 'Failed to save')
    }
    const j = await res.json()
    if (j?.data) setProfile((prev) => (prev ? { ...prev, bio } : null))
  }

  const handlePreferencesSave = async (theme: string, units: string) => {
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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

  const handleViewPublic = () => {
    if (profile?.username) {
      router.push(`/u/${profile.username}`)
    }
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
        displayName={profile.display_name}
        username={profile.username || undefined}
        avatarUrl={profile.avatar_url || undefined}
        locationCity={profile.location_city || undefined}
        locationRegion={profile.location_region || undefined}
        createdAt={profile.created_at || undefined}
        verified={profile.verified || false}
        isOwner={true}
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
            <AvatarUploader
              initialUrl={profile.avatar_url || undefined}
              onUpdated={(url) => {
                setProfile((prev) => (prev ? { ...prev, avatar_url: url } : null))
                setShowAvatarUploader(false)
              }}
            />
          </div>
        </div>
      )}

      <AboutCard bio={profile.bio || undefined} isEditable={true} onSave={handleBioSave} />

      {preferredCategories.length > 0 && <PreferredCategories categories={preferredCategories} />}

      {metrics && <OwnerMetrics {...metrics} loading={false} />}

      <OwnerListingsTabs
        active={listings.active}
        drafts={listings.drafts}
        archived={listings.archived}
        onEdit={(id) => router.push(`/sell/edit/${id}`)}
        onArchive={(id) => {
          // TODO: Implement archive
          console.log('Archive:', id)
        }}
        onUnarchive={(id) => {
          // TODO: Implement unarchive
          console.log('Unarchive:', id)
        }}
        onDelete={(id) => {
          // TODO: Implement delete
          console.log('Delete:', id)
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

function AvatarUploader({ initialUrl, onUpdated }: { initialUrl?: string; onUpdated: (url: string | null) => void }) {
  const [preview, setPreview] = useState<string | undefined>(initialUrl)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    setUploading(true)
    try {
      const sig = await fetch('/api/profile/avatar', { method: 'POST' }).then((r) => r.json())
      if (!sig?.ok) throw new Error(sig?.error || 'Failed to get signature')
      const form = new FormData()
      form.append('file', file)
      form.append('timestamp', String(sig.data.timestamp))
      form.append('api_key', sig.data.api_key)
      form.append('signature', sig.data.signature)
      form.append('folder', sig.data.folder)
      if (sig.data.eager) form.append('eager', sig.data.eager)
      const cloudUrl = `https://api.cloudinary.com/v1_1/${sig.data.cloud_name}/image/upload`
      const up = await fetch(cloudUrl, { method: 'POST', body: form })
      const uj = await up.json()
      if (!up.ok) throw new Error(uj?.error?.message || 'Upload failed')
      setPreview(uj.secure_url)
      // persist to profile
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: uj.secure_url }),
      })
      if (res.ok) onUpdated(uj.secure_url)
    } catch (e: any) {
      setErr(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onRemove = async () => {
    setUploading(true)
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_url: null }),
    })
    setPreview(undefined)
    onUpdated(null)
    setUploading(false)
  }

  return (
    <div className="space-y-4">
      {preview ? (
        <div
          className="w-32 h-32 rounded-full mx-auto"
          style={{ backgroundImage: `url(${preview})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
      ) : (
        <div className="w-32 h-32 rounded-full bg-neutral-200 mx-auto" />
      )}
      <div className="flex gap-2 items-center justify-center">
        <label className="btn-accent cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={onUpload} disabled={uploading} />
          {uploading ? 'Uploading…' : 'Upload'}
        </label>
        {preview && (
          <button type="button" className="rounded px-4 py-2 border" onClick={onRemove} disabled={uploading}>
            Remove
          </button>
        )}
      </div>
      {err && <div className="text-red-600 text-sm text-center">{err}</div>}
    </div>
  )
}
