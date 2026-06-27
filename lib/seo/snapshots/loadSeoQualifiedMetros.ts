import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { SeoQualifiedMetroRow } from '@/lib/seo/snapshots/types'

export async function loadQualifiedMetroSlugs(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<string[]> {
  const { data, error } = await fromBase(admin, 'seo_qualified_metros')
    .select('slug')
    .eq('qualified', true)
    .order('slug', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => String((row as { slug: string }).slug))
}

export async function countQualifiedSeoMetros(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<number> {
  const { count, error } = await fromBase(admin, 'seo_qualified_metros')
    .select('slug', { count: 'exact', head: true })
    .eq('qualified', true)

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

export async function loadLatestQualifiedMetroSnapshotUpdatedAt(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<string | null> {
  const { data, error } = await fromBase(admin, 'seo_qualified_metros')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as { updated_at: string } | null)?.updated_at ?? null
}

export async function loadAllSeoQualifiedMetroRows(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<SeoQualifiedMetroRow[]> {
  const { data, error } = await fromBase(admin, 'seo_qualified_metros')
    .select('slug, qualified, listing_count, crawlable_ratio, city, state, timezone, updated_at')
    .order('slug', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as SeoQualifiedMetroRow[]
}

export async function loadSeoQualifiedMetroBySlug(
  slug: string,
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<SeoQualifiedMetroRow | null> {
  const { data, error } = await fromBase(admin, 'seo_qualified_metros')
    .select('slug, qualified, listing_count, crawlable_ratio, city, state, timezone, updated_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as SeoQualifiedMetroRow | null) ?? null
}

export async function loadNearbyQualifiedMetros(
  metro: { slug: string; state: string },
  admin: ReturnType<typeof getAdminDb> = getAdminDb(),
  limit = 4
): Promise<SeoQualifiedMetroRow[]> {
  const { data, error } = await fromBase(admin, 'seo_qualified_metros')
    .select('slug, qualified, listing_count, crawlable_ratio, city, state, timezone, updated_at')
    .eq('state', metro.state)
    .neq('slug', metro.slug)
    .order('listing_count', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as SeoQualifiedMetroRow[]
}
