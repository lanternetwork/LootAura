import type { SeoPilotMetro } from '@/lib/seo/types'

/**
 * Initial SEO pilot metros (3–5 strongest). Phase 6 expands only via operational gates.
 * Inventory thresholds are conservative until per-metro scoring is wired to live counts.
 */
export const SEO_PILOT_METROS: SeoPilotMetro[] = [
  {
    slug: 'dallas-tx',
    city: 'Dallas',
    state: 'TX',
    timezone: 'America/Chicago',
    minActiveListings: 25,
  },
  {
    slug: 'phoenix-az',
    city: 'Phoenix',
    state: 'AZ',
    timezone: 'America/Phoenix',
    minActiveListings: 25,
  },
  {
    slug: 'nashville-tn',
    city: 'Nashville',
    state: 'TN',
    timezone: 'America/Chicago',
    minActiveListings: 25,
  },
  {
    slug: 'atlanta-ga',
    city: 'Atlanta',
    state: 'GA',
    timezone: 'America/New_York',
    minActiveListings: 25,
  },
  {
    slug: 'houston-tx',
    city: 'Houston',
    state: 'TX',
    timezone: 'America/Chicago',
    minActiveListings: 25,
  },
]

export function getPilotMetroBySlug(slug: string): SeoPilotMetro | undefined {
  return SEO_PILOT_METROS.find((m) => m.slug === slug)
}

export function buildMetroSlug(city: string, state: string): string {
  const cityPart = city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const statePart = state.trim().toLowerCase()
  return `${cityPart}-${statePart}`
}
