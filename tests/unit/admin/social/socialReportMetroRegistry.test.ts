import { describe, it, expect } from 'vitest'
import {
  listSocialReportRegistryMetros,
  mergeSocialMetroOptions,
  resolveSocialReportMetro,
} from '@/lib/admin/social/socialReportMetroRegistry'
import { listSocialReportRankingPresetSlugs } from '@/lib/admin/social/socialReportViewportPresets'
import {
  geographyBySlugFromRows,
  TEST_GEO_CHICAGO,
  TEST_SOCIAL_PRESET_GEOGRAPHY,
} from '../../seo/metroGeographyTestFixtures'
import { TEST_SEO_METRO_DALLAS } from '../../seo/seoTestFixtures'

describe('socialReportMetroRegistry', () => {
  const geographyBySlug = geographyBySlugFromRows(TEST_SOCIAL_PRESET_GEOGRAPHY)

  it('lists all seven supported preset metros from geography', () => {
    const registry = listSocialReportRegistryMetros(geographyBySlug)
    expect(registry.map((metro) => metro.slug)).toEqual(listSocialReportRankingPresetSlugs())
    expect(registry.map((metro) => metro.slug)).toContain('chicago-il')
  })

  it('resolves preset metros when discovery is empty', () => {
    expect(resolveSocialReportMetro('chicago-il', [], geographyBySlug)).toEqual(
      expect.objectContaining({ slug: 'chicago-il', city: 'Chicago', state: 'IL' })
    )
  })

  it('resolves discovered metros when slug is not a preset', () => {
    const naperville = {
      slug: 'naperville-il',
      city: 'Naperville',
      state: 'IL',
      timezone: 'America/Chicago',
      minActiveListings: 25,
    }
    expect(resolveSocialReportMetro('naperville-il', [naperville], geographyBySlug)).toEqual(
      naperville
    )
  })

  it('prefers registry over discovery for the same slug', () => {
    const discoveredChicago = {
      ...TEST_GEO_CHICAGO,
      slug: 'chicago-il',
      city: 'Chicago Heights',
      state: 'IL',
      timezone: 'America/Chicago',
      minActiveListings: 25,
    }
    expect(resolveSocialReportMetro('chicago-il', [discoveredChicago], geographyBySlug)).toEqual(
      expect.objectContaining({ city: 'Chicago' })
    )
  })

  it('merges preset metros first and dedupes discovered overlaps', () => {
    const options = mergeSocialMetroOptions(
      [TEST_SEO_METRO_DALLAS, { ...TEST_GEO_CHICAGO, slug: 'chicago-il', minActiveListings: 25 }],
      geographyBySlug,
      (city, state) => `${city}, ${state}`
    )

    expect(options[0].slug).toBe('chicago-il')
    expect(options.map((option) => option.slug)).toEqual([
      'chicago-il',
      'dallas-tx',
      'houston-tx',
      'phoenix-az',
      'atlanta-ga',
      'austin-tx',
      'louisville-ky',
    ])
  })

  it('appends additional discovered metros alphabetically after presets', () => {
    const options = mergeSocialMetroOptions(
      [
        {
          slug: 'naperville-il',
          city: 'Naperville',
          state: 'IL',
          timezone: 'America/Chicago',
          minActiveListings: 25,
        },
        {
          slug: 'aurora-il',
          city: 'Aurora',
          state: 'IL',
          timezone: 'America/Chicago',
          minActiveListings: 25,
        },
      ],
      geographyBySlug,
      (city, state) => `${city}, ${state}`
    )

    const presetCount = listSocialReportRankingPresetSlugs().length
    expect(options).toHaveLength(presetCount + 2)
    expect(options[presetCount]?.slug).toBe('aurora-il')
    expect(options[presetCount + 1]?.slug).toBe('naperville-il')
  })
})
