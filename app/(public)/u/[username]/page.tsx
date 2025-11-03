import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { deriveCategories } from '@/lib/profile/deriveCategories'

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const username = decodeURIComponent(params.username)
  const supabase = createSupabaseServerClient()
  // Resolve profile by username or id
  const prof = await supabase
    .from('profiles_v2')
    .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
    .or(`username.eq.${username},id.eq.${username}`)
    .maybeSingle()
  const profile = prof.data
  if (!profile) return notFound()
  const preferred = await deriveCategories(profile.id)
  const listings = await supabase
    .from('sales_v2')
    .select('id, title, cover_url, address, status, owner_id')
    .eq('owner_id', profile.id)
    .eq('status', 'active')
    .range(0, 11)
  const items = listings.data || []
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

      {preferred && preferred.length > 0 && (
        <div className="card">
          <div className="card-body">
            <div className="text-sm text-neutral-600 mb-2">Preferred categories (auto‑derived)</div>
            <div className="flex flex-wrap gap-2">
              {preferred.map((c: string) => (
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


