import { SEO_METRO_MIN_ACTIVE_LISTINGS } from '@/lib/seo/metroCatalog'
import type { SeoMetro } from '@/lib/seo/types'

export type SeededMetro = {
  slug: string
  city: string
  state: string
  timezone: string
}

const SEEDED_MAJOR_METROS: SeededMetro[] = [
  { slug: 'louisville-ky', city: 'Louisville', state: 'KY', timezone: 'America/New_York' },
  { slug: 'lexington-ky', city: 'Lexington', state: 'KY', timezone: 'America/New_York' },
  { slug: 'cincinnati-oh', city: 'Cincinnati', state: 'OH', timezone: 'America/New_York' },
  { slug: 'indianapolis-in', city: 'Indianapolis', state: 'IN', timezone: 'America/Indiana/Indianapolis' },
  { slug: 'nashville-tn', city: 'Nashville', state: 'TN', timezone: 'America/Chicago' },
  { slug: 'st-louis-mo', city: 'St. Louis', state: 'MO', timezone: 'America/Chicago' },
  { slug: 'chicago-il', city: 'Chicago', state: 'IL', timezone: 'America/Chicago' },
  { slug: 'atlanta-ga', city: 'Atlanta', state: 'GA', timezone: 'America/New_York' },
  { slug: 'dallas-tx', city: 'Dallas', state: 'TX', timezone: 'America/Chicago' },
  { slug: 'houston-tx', city: 'Houston', state: 'TX', timezone: 'America/Chicago' },
  { slug: 'san-antonio-tx', city: 'San Antonio', state: 'TX', timezone: 'America/Chicago' },
  { slug: 'austin-tx', city: 'Austin', state: 'TX', timezone: 'America/Chicago' },
]

const BY_SLUG = new Map(SEEDED_MAJOR_METROS.map((metro) => [metro.slug, metro]))

export function getSeededMajorMetros(): readonly SeededMetro[] {
  return SEEDED_MAJOR_METROS
}

export function getSeededMajorMetroCount(): number {
  return SEEDED_MAJOR_METROS.length
}

export function getSeededMajorMetroSlugs(): string[] {
  return SEEDED_MAJOR_METROS.map((metro) => metro.slug)
}

export function getSeededMajorMetroBySlug(slug: string): SeededMetro | undefined {
  return BY_SLUG.get(slug)
}

export function isSeededMajorMetroSlug(slug: string): boolean {
  return BY_SLUG.has(slug)
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
