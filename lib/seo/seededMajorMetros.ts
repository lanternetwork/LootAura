/**
 * @deprecated Identity fields moved to seo_metro_geography. Use loadSeoMetroGeography / qualified_override.
 * Retained for migration parity and tests referencing override slug set.
 */
import { SEO_METRO_MIN_ACTIVE_LISTINGS } from '@/lib/seo/metroCatalog'
import type { SeoMetro } from '@/lib/seo/types'

export type SeededMetro = {
  slug: string
  city: string
  state: string
  timezone: string
}

/** Slugs seeded with qualified_override=true in migration 232. */
export const QUALIFIED_OVERRIDE_METRO_SLUGS = [
  'louisville-ky',
  'lexington-ky',
  'cincinnati-oh',
  'indianapolis-in',
  'nashville-tn',
  'st-louis-mo',
  'chicago-il',
  'atlanta-ga',
  'dallas-tx',
  'houston-tx',
  'san-antonio-tx',
  'austin-tx',
] as const

const QUALIFIED_OVERRIDE_SET = new Set<string>(QUALIFIED_OVERRIDE_METRO_SLUGS)

/** @deprecated Use loadGeographyQualifiedOverrideSlugs() */
export function getSeededMajorMetros(): readonly SeededMetro[] {
  return []
}

/** @deprecated Use countGeographyQualifiedOverrides() */
export function getSeededMajorMetroCount(): number {
  return QUALIFIED_OVERRIDE_METRO_SLUGS.length
}

/** @deprecated Use loadGeographyQualifiedOverrideSlugs() */
export function getSeededMajorMetroSlugs(): string[] {
  return [...QUALIFIED_OVERRIDE_METRO_SLUGS]
}

/** @deprecated Use loadSeoMetroGeographyBySlug() */
export function getSeededMajorMetroBySlug(_slug: string): SeededMetro | undefined {
  return undefined
}

/** @deprecated Use geography row qualified_override */
export function isSeededMajorMetroSlug(slug: string): boolean {
  return QUALIFIED_OVERRIDE_SET.has(slug.trim().toLowerCase())
}

export function seededMetroToSeoMetro(seeded: SeededMetro): SeoMetro {
  return {
    slug: seeded.slug,
    city: seeded.city,
    state: seeded.state,
    timezone: seeded.timezone,
    minActiveListings: SEO_METRO_MIN_ACTIVE_LISTINGS,
  }
}
