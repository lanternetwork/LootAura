import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { deriveCategories } from '@/lib/profile/deriveCategories'
import { createPageMetadata } from '@/lib/metadata'
import { getUserRatingForSeller } from '@/lib/data/ratingsAccess'
import { IdentityCard } from '@/components/profile/IdentityCard'
import { SocialLinksRow } from '@/components/profile/SocialLinksRow'
import { AboutCard } from '@/components/profile/AboutCard'
import { PreferredCategories } from '@/components/profile/PreferredCategories'
import { SellerSignals } from '@/components/profile/SellerSignals'
import { SellerRatingStars } from '@/components/seller/SellerRatingStars'
import Link from 'next/link'
import { Suspense } from 'react'

type PublicProfilePageProps = {
  params: { username: string }
  searchParams: { page?: string }
}

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const slug = decodeURIComponent(params.username)
  const supabase = createSupabaseServerClient()
  
  // Detect if slug is UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)
  
  const prof = isUUID
    ? await supabase.from('profiles_v2').select('display_name, bio, avatar_url, username').eq('id', slug).maybeSingle()
    : await supabase.from('profiles_v2').select('display_name, bio, avatar_url, username').eq('username', slug).maybeSingle()
  
  let profile = prof.data as any
  if (!profile) {
    // Fallback to base table if view has not materialized yet
    const byTable = isUUID
      ? await supabase.from('profiles').select('id, created_at').eq('id', slug).maybeSingle()
      : await supabase.from('profiles_v2').select('id, username, created_at').eq('username', slug).maybeSingle()
    if (byTable.data) {
      const username = isUUID ? null : (byTable.data as any).username ?? null
      profile = {
        username,
        display_name: null,
        bio: null,
        avatar_url: null,
      }
    }
  }
  if (!profile) {
    return createPageMetadata({ title: 'User Not Found', path: `/u/${slug}` })
  }
  
  const title = profile.display_name || profile.username || slug
  const description = profile.bio || `View ${title}'s profile on Loot Aura`
  const image = profile.avatar_url || undefined
  
  return createPageMetadata({
    title,
    description,
    path: `/u/${slug}`,
    image,
    type: 'website',
  })
}

async function fetchProfileData(slug: string) {
  const supabase = createSupabaseServerClient()
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] public page fetch start', { slug })
  }
  
  // Detect if slug is UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)
  
  let prof
  if (isUUID) {
    // Treat as user_id
    prof = await supabase
      .from('profiles_v2')
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, social_links')
      .eq('id', slug)
      .maybeSingle()
  } else {
    // Treat as username
    prof = await supabase
      .from('profiles_v2')
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, social_links')
      .eq('username', slug)
      .maybeSingle()
  }
  
  const profile = prof.data as any
  // No fallback to base table - profiles_v2 view is the only source for public profile data
  // This ensures anon users cannot access sensitive fields (lock fields, email prefs) from base table
  if (!profile) return null
  
  const [preferred, ownerStatsResult] = await Promise.all([
    deriveCategories(profile.id).catch(() => []),
    supabase
      .from('owner_stats')
      .select('avg_rating, ratings_count, total_sales')
      .eq('user_id', profile.id)
      .maybeSingle(),
  ])

  const ownerStats = ownerStatsResult.error || !ownerStatsResult.data
    ? { avg_rating: null, ratings_count: null, total_sales: null }
    : ownerStatsResult.data

  // Fetch current user's rating for this seller (if authenticated)
  let currentUserRating: number | null = null
  const { data: { user } } = await supabase.auth.getUser()
  if (user && user.id !== profile.id) {
    currentUserRating = await getUserRatingForSeller(supabase, profile.id, user.id).catch(() => null)
  }
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] public page fetch end', { slug, hasProfile: !!profile, categoriesCount: preferred.length })
  }

  return {
    profile,
    preferred,
    ownerStats,
    currentUserRating,
  }
}

async function fetchListings(userId: string, page: number) {
  const supabase = createSupabaseServerClient()
  const limit = 12
  const from = (page - 1) * limit
  const to = from + limit - 1
  
  const q = await supabase
    .from('sales_v2')
    .select('id, title, cover_image_url, images, address, status, owner_id, created_at', { count: 'exact' })
    .eq('owner_id', userId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(from, to)
  
  if (q.error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE] Error fetching listings:', q.error)
    }
    return {
      items: [],
      total: 0,
      page,
      hasMore: false,
    }
  }
  
  return {
    items: q.data || [],
    total: q.count || 0,
    page,
    hasMore: to + 1 < (q.count || 0),
  }
}

function ListingSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="card-body">
        <div className="w-full h-32 rounded mb-2 bg-neutral-200" />
        <div className="h-4 bg-neutral-200 rounded mb-2 w-3/4" />
        <div className="h-3 bg-neutral-200 rounded w-1/2" />
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="card-body-lg flex items-start gap-4">
        <div className="w-20 h-20 rounded-full bg-neutral-200" />
        <div className="flex-1 space-y-2">
          <div className="h-6 bg-neutral-200 rounded w-1/2" />
          <div className="h-4 bg-neutral-200 rounded w-1/3" />
          <div className="h-4 bg-neutral-200 rounded w-1/4" />
        </div>
      </div>
    </div>
  )
}

export default async function PublicProfilePage({ params, searchParams }: PublicProfilePageProps) {
  const slug = decodeURIComponent(params.username)
  const page = Number(searchParams.page || '1')
  
  const data = await fetchProfileData(slug)
  if (!data) return notFound()
  
  const { profile, preferred, ownerStats, currentUserRating } = data
  const listings = await fetchListings(profile.id, page)
  
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Suspense fallback={<ProfileSkeleton />}>
        <div>
          <IdentityCard
            profile={{
              displayName: profile.display_name,
              username: profile.username,
              avatarUrl: profile.avatar_url ? `${profile.avatar_url}?v=${Date.now()}` : null,
              locationCity: profile.location_city,
              locationRegion: profile.location_region,
              createdAt: profile.created_at,
              verified: profile.verified,
            }}
            mode="public"
          />
          <SocialLinksRow socialLinks={profile.social_links as any} />
        </div>
      </Suspense>
      
      <Suspense fallback={<div className="card animate-pulse"><div className="card-body-lg h-32 bg-neutral-200 rounded" /></div>}>
        <AboutCard
          bio={profile.bio}
          displayName={profile.display_name}
          locationCity={profile.location_city}
          locationRegion={profile.location_region}
          isEditable={false}
        />
      </Suspense>
      
      {preferred.length > 0 && (
        <PreferredCategories categories={preferred} />
      )}
      
      <SellerSignals
        avgRating={ownerStats.avg_rating}
        ratingsCount={ownerStats.ratings_count}
        salesFulfilled={ownerStats.total_sales}
        memberSince={profile.created_at}
      />

      {/* Seller Rating Component */}
      {profile.id && (
        <div className="card">
          <div className="card-body-lg">
            <h2 className="card-title mb-4">Rate This Seller</h2>
            <SellerRatingStars
              sellerId={profile.id}
              saleId={null}
              currentUserRating={currentUserRating ?? null}
              avgRating={ownerStats.avg_rating}
              ratingsCount={ownerStats.ratings_count ?? 0}
              isSeller={false} // Will be determined client-side by the component
            />
          </div>
        </div>
      )}
      
      <div className="card">
        <div className="card-body-lg">
          <h2 className="card-title mb-4">Active listings</h2>
          {listings.items.length === 0 ? (
            <div className="text-neutral-600">No active listings.</div>
          ) : (
            <>
              <Suspense fallback={
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <ListingSkeleton key={i} />
                  ))}
                </div>
              }>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {listings.items.map((it: any) => {
                    // Get cover image - prefer cover_image_url, fallback to first image in images array
                    const coverImage = it.cover_image_url || 
                      (Array.isArray(it.images) && it.images.length > 0 ? it.images[0] : null)
                    
                    return (
                      <div key={it.id} className="card">
                        <div className="card-body">
                          <div
                            className="w-full h-32 rounded mb-2 bg-neutral-200"
                            style={coverImage ? { backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                            aria-label={it.title}
                          />
                          <div className="font-medium truncate mb-1">{it.title}</div>
                          {it.address && <div className="text-sm text-neutral-600 truncate mb-2">{it.address}</div>}
                          <Link href={`/sales/${it.id}`} className="link-accent text-sm">
                            View →
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Suspense>
              
              {listings.total > listings.items.length && (
                <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
                  <div className="text-sm text-neutral-600">
                    Showing {listings.items.length} of {listings.total} listings
                  </div>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <Link
                        href={`/u/${encodeURIComponent(slug)}?page=${page - 1}`}
                        className="btn-accent text-sm"
                      >
                        Previous
                      </Link>
                    )}
                    {listings.hasMore && (
                      <Link
                        href={`/u/${encodeURIComponent(slug)}?page=${page + 1}`}
                        className="btn-accent text-sm"
                      >
                        Next
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
