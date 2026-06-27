import { SEO_METRO_MIN_ACTIVE_LISTINGS } from '@/lib/seo/metroCatalog'
import type { SeoMetroGeographyRow } from '@/lib/seo/metroGeographyTypes'
import {
  getSeededMajorMetroCount,
  getSeededMajorMetroSlugs,
} from '@/lib/seo/seededMajorMetros'
import type { SeoMetro } from '@/lib/seo/types'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

function isMissingGeographyTableError(error: { message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('seo_metro_geography') &&
    (message.includes('could not find') ||
      message.includes('does not exist') ||
      message.includes('schema cache'))
  )
}

function rowFromDb(row: Record<string, unknown>): SeoMetroGeographyRow {
  return {
    slug: String(row.slug),
    city: String(row.city),
    state: String(row.state),
    timezone: String(row.timezone),
    center_lat: Number(row.center_lat),
    center_lng: Number(row.center_lng),
    radius_miles: Number(row.radius_miles),
    qualified_override: row.qualified_override === true,
    updated_at: String(row.updated_at),
  }
}

export function geographyRowToSeoMetro(row: SeoMetroGeographyRow): SeoMetro {
  return {
    slug: row.slug,
    city: row.city,
    state: row.state.trim().toUpperCase(),
    timezone: row.timezone,
    minActiveListings: SEO_METRO_MIN_ACTIVE_LISTINGS,
  }
}

export async function loadAllSeoMetroGeography(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<SeoMetroGeographyRow[]> {
  const { data, error } = await fromBase(admin, 'seo_metro_geography')
    .select(
      'slug, city, state, timezone, center_lat, center_lng, radius_miles, qualified_override, updated_at'
    )
    .order('slug', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => rowFromDb(row as Record<string, unknown>))
}

export async function loadSeoMetroGeographyBySlug(
  slug: string,
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<SeoMetroGeographyRow | null> {
  const { data, error } = await fromBase(admin, 'seo_metro_geography')
    .select(
      'slug, city, state, timezone, center_lat, center_lng, radius_miles, qualified_override, updated_at'
    )
    .eq('slug', slug.trim().toLowerCase())
    .maybeSingle()

  if (error) {
    if (isMissingGeographyTableError(error)) {
      return null
    }
    throw new Error(error.message)
  }

  return data ? rowFromDb(data as Record<string, unknown>) : null
}

export async function loadSeoMetroGeographyBySlugs(
  slugs: string[],
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<SeoMetroGeographyRow[]> {
  const normalized = [...new Set(slugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean))]
  if (normalized.length === 0) return []

  const { data, error } = await fromBase(admin, 'seo_metro_geography')
    .select(
      'slug, city, state, timezone, center_lat, center_lng, radius_miles, qualified_override, updated_at'
    )
    .in('slug', normalized)

  if (error) {
    if (isMissingGeographyTableError(error)) {
      return []
    }
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => rowFromDb(row as Record<string, unknown>))
}

export async function countGeographyQualifiedOverrides(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<number> {
  const { count, error } = await fromBase(admin, 'seo_metro_geography')
    .select('slug', { count: 'exact', head: true })
    .eq('qualified_override', true)

  if (error) {
    if (isMissingGeographyTableError(error)) {
      return getSeededMajorMetroCount()
    }
    throw new Error(error.message)
  }

  return count ?? 0
}

export async function loadGeographyQualifiedOverrideSlugs(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<string[]> {
  const { data, error } = await fromBase(admin, 'seo_metro_geography')
    .select('slug')
    .eq('qualified_override', true)
    .order('slug', { ascending: true })

  if (error) {
    if (isMissingGeographyTableError(error)) {
      return getSeededMajorMetroSlugs()
    }
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => String((row as { slug: string }).slug))
}
