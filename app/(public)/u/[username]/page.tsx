import Link from 'next/link'

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: 'no-store' })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
}

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const username = decodeURIComponent(params.username)
  const [{ ok: pOK, data: pData }, { ok: lOK, data: lData }] = await Promise.all([
    fetchJSON(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/public/profile?username=${encodeURIComponent(username)}`),
    fetchJSON(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/public/listings?user=${encodeURIComponent(username)}&page=1&limit=12`),
  ])
  const profile = pData?.profile
  const items = lData?.items || []
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="card">
        <div className="card-body-lg flex items-start gap-4">
          <div className="w-20 h-20 rounded-full bg-neutral-200" style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} aria-label={profile?.display_name || username} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold truncate">{profile?.display_name || username}</h1>
              {profile?.verified && <span className="badge-accent">Verified</span>}
            </div>
            <div className="text-sm text-neutral-600">@{username}{profile?.location_city ? ` · ${profile.location_city}${profile.location_region ? ', ' + profile.location_region : ''}` : ''}</div>
            {profile?.created_at && (<div className="text-sm text-neutral-600">Member since {new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</div>)}
          </div>
          <div className="hidden sm:flex gap-2">
            <Link href="#" className="btn-accent">Message Seller</Link>
            <button className="rounded px-4 py-2 border">Copy Link</button>
            <button className="rounded px-4 py-2 border">Report</button>
          </div>
        </div>
      </div>

      {pData?.preferred && pData.preferred.length > 0 && (
        <div className="card">
          <div className="card-body">
            <div className="text-sm text-neutral-600 mb-2">Preferred categories (auto‑derived)</div>
            <div className="flex flex-wrap gap-2">
              {pData.preferred.map((c: string) => (
                <span key={c} className="badge-accent">{c}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body-lg">
          <h2 className="card-title mb-4">Active listings</h2>
          {items.length === 0 ? (
            <div className="text-neutral-600">No active listings.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((it: any) => (
                <div key={it.id} className="card">
                  <div className="card-body">
                    <div className="w-full h-32 rounded mb-2 bg-neutral-200" style={it.cover_url ? { backgroundImage: `url(${it.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />
                    <div className="font-medium truncate">{it.title}</div>
                    <div className="text-sm text-neutral-600 truncate">{it.address || ''}</div>
                    <Link href={`/sales/${it.id}`} className="link-accent text-sm mt-2 inline-block">View</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


