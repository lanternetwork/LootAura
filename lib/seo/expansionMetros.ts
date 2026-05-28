import type { SeoPilotMetro } from '@/lib/seo/types'

/**
 * Tier-2 expansion candidates — pages/index only when ops activates via SEO_EXPANSION_METRO_SLUGS
 * and metro passes the same qualification matrix as pilots (inventory scoreboard).
 */
export const SEO_EXPANSION_METRO_CANDIDATES: SeoPilotMetro[] = [
  {
    slug: 'austin-tx',
    city: 'Austin',
    state: 'TX',
    timezone: 'America/Chicago',
    minActiveListings: 25,
  },
  {
    slug: 'charlotte-nc',
    city: 'Charlotte',
    state: 'NC',
    timezone: 'America/New_York',
    minActiveListings: 25,
  },
  {
    slug: 'denver-co',
    city: 'Denver',
    state: 'CO',
    timezone: 'America/Denver',
    minActiveListings: 25,
  },
  {
    slug: 'orlando-fl',
    city: 'Orlando',
    state: 'FL',
    timezone: 'America/New_York',
    minActiveListings: 25,
  },
  {
    slug: 'tampa-fl',
    city: 'Tampa',
    state: 'FL',
    timezone: 'America/New_York',
    minActiveListings: 25,
  },
  {
    slug: 'san-antonio-tx',
    city: 'San Antonio',
    state: 'TX',
    timezone: 'America/Chicago',
    minActiveListings: 25,
  },
]
