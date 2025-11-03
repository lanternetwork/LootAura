'use client'

import { useEffect, useState } from 'react'

type Profile = {
  id: string
  display_name?: string | null
  avatar_url?: string | null
  home_zip?: string | null
  preferences?: any
}

export default function ProfileClient() {
  const [tab, setTab] = useState<'account' | 'avatar' | 'preferences'>('account')
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setLoading(true)
        const [p, prefs] = await Promise.all([
          fetch('/api/profile').then(r => r.json()),
          fetch('/api/preferences').then(r => r.json()),
        ])
        if (!mounted) return
        if (p?.profile) setProfile(p.profile)
        // merge prefs into profile.preferences for display
        setProfile(prev => prev ? { ...prev, preferences: prefs?.data ?? prev.preferences } : prev)
      } catch (e) {
        setError('Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      <div className="flex gap-2 mb-6">
        <button className={`px-3 py-1.5 rounded border ${tab==='account' ? 'btn-accent' : ''}`} onClick={() => setTab('account')}>Account</button>
        <button className={`px-3 py-1.5 rounded border ${tab==='avatar' ? 'btn-accent' : ''}`} onClick={() => setTab('avatar')}>Avatar</button>
        <button className={`px-3 py-1.5 rounded border ${tab==='preferences' ? 'btn-accent' : ''}`} onClick={() => setTab('preferences')}>Preferences</button>
      </div>
      {loading && <div className="text-neutral-600">Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && !error && profile && (
        <div className="space-y-6">
          {tab==='account' && <AccountForm initial={profile} onUpdated={setProfile} />}
          {tab==='avatar' && <AvatarUploader initialUrl={profile.avatar_url || undefined} onUpdated={(u) => setProfile({ ...profile, avatar_url: u })} />}
          {tab==='preferences' && <PreferencesForm initial={profile.preferences} />}
        </div>
      )}
    </div>
  )
}

function AccountForm({ initial, onUpdated }: { initial: Profile; onUpdated: (p: Profile) => void }) {
  const [displayName, setDisplayName] = useState(initial.display_name || '')
  const [bio, setBio] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setSaving(true)
    const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: displayName, bio, location_city: city, location_region: region }) })
    const j = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(j?.error || 'Failed to save'); return }
    if (j?.data) onUpdated(j.data)
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="card-body-lg space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Display name</label>
          <input className="w-full px-3 py-2 border rounded" value={displayName} onChange={e=>setDisplayName(e.target.value)} required maxLength={60} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea className="w-full px-3 py-2 border rounded" value={bio} onChange={e=>setBio(e.target.value)} maxLength={500} rows={3} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input className="w-full px-3 py-2 border rounded" value={city} onChange={e=>setCity(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Region/State</label>
            <input className="w-full px-3 py-2 border rounded" value={region} onChange={e=>setRegion(e.target.value)} maxLength={80} />
          </div>
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <div className="flex gap-2">
          <button type="submit" className="btn-accent" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="rounded px-4 py-2 border" onClick={()=>{ setDisplayName(initial.display_name || ''); setBio(''); setCity(''); setRegion('') }}>Reset</button>
        </div>
      </div>
    </form>
  )
}

function AvatarUploader({ initialUrl, onUpdated }: { initialUrl?: string; onUpdated: (url: string|null)=>void }) {
  const [preview, setPreview] = useState<string | undefined>(initialUrl)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    setUploading(true)
    try {
      const sig = await fetch('/api/profile/avatar', { method: 'POST' }).then(r => r.json())
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
      const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: '', avatar_url: uj.secure_url }) })
      if (res.ok) onUpdated(uj.secure_url)
    } catch (e:any) {
      setErr(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onRemove = async () => {
    setUploading(true)
    await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: '', avatar_url: null }) })
    setPreview(undefined)
    onUpdated(null)
    setUploading(false)
  }

  return (
    <div className="card">
      <div className="card-body-lg space-y-4">
        {preview ? (
          <div className="w-32 h-32 rounded-full" style={{ backgroundImage: `url(${preview})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        ) : (
          <div className="w-32 h-32 rounded-full bg-neutral-200" />
        )}
        <div className="flex gap-2 items-center">
          <label className="btn-accent cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
            {uploading ? 'Uploading…' : 'Upload'}
          </label>
          {preview && <button type="button" className="rounded px-4 py-2 border" onClick={onRemove} disabled={uploading}>Remove</button>}
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>
    </div>
  )
}

function PreferencesForm({ initial }: { initial: any }) {
  const [theme, setTheme] = useState<string>(initial?.theme ?? 'system')
  const [units, setUnits] = useState<string>(initial?.units ?? 'imperial')
  const [radius, setRadius] = useState<number>(initial?.discovery_radius_km ?? 10)
  const [email, setEmail] = useState<boolean>(Boolean(initial?.email_opt_in))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (radius < 1 || radius > 50) { setErr('Radius must be 1–50'); return }
    setSaving(true)
    const res = await fetch('/api/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme, units, discovery_radius_km: radius, email_opt_in: email }) })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j?.error || 'Failed to save preferences')
    }
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="card-body-lg space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Theme</label>
            <select className="w-full px-3 py-2 border rounded" value={theme} onChange={e=>setTheme(e.target.value)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Units</label>
            <select className="w-full px-3 py-2 border rounded" value={units} onChange={e=>setUnits(e.target.value)}>
              <option value="imperial">Imperial</option>
              <option value="metric">Metric</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Discovery radius (km): {radius}</label>
          <input type="range" min={1} max={50} value={radius} onChange={e=>setRadius(Number(e.target.value))} className="w-full" />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={email} onChange={e=>setEmail(e.target.checked)} className="rounded border-gray-300" />
          <span>Email opt-in</span>
        </label>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <div className="flex gap-2">
          <button type="submit" className="btn-accent" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="rounded px-4 py-2 border" onClick={()=>{ setTheme(initial?.theme ?? 'system'); setUnits(initial?.units ?? 'imperial'); setRadius(initial?.discovery_radius_km ?? 10); setEmail(Boolean(initial?.email_opt_in)) }}>Reset</button>
        </div>
      </div>
    </form>
  )
}


