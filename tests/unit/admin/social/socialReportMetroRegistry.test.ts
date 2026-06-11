import { describe, it, expect } from 'vitest'
import {
  listSocialReportRegistryMetros,
  mergeSocialMetroOptions,
  resolveSocialReportMetro,
} from '@/lib/admin/social/socialReportMetroRegistry'
import { listSocialReportRankingPresetSlugs } from '@/lib/admin/social/socialReportViewportPresets'
import { TEST_SEO_METRO_CHICAGO, TEST_SEO_METRO_DALLAS } from '../../seo/seoTestFixtures'

describe('socialReportMetroRegistry', () => {
  it('lists all seven supported preset metros', () => {
    const registry = listSocialReportRegistryMetros()
    expect(registry.map((metro) => metro.slug)).toEqual(listSocialReportRankingPresetSlugs())
    expect(registry.map((metro) => metro.slug)).toContain('chicago-il')
  })

  it('resolves preset metros when discovery is empty', () => {
    expect(resolveSocialReportMetro('chicago-il', [])).toEqual(
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
    expect(resolveSocialReportMetro('naperville-il', [naperville])).toEqual(naperville)
  })

  it('prefers registry over discovery for the same slug', () => {
    const discoveredChicago = {
      ...TEST_SEO_METRO_CHICAGO,
      city: 'Chicago Heights',
    }
    expect(resolveSocialReportMetro('chicago-il', [discoveredChicago])).toEqual(
      expect.objectContaining({ city: 'Chicago' })
    )
  })

  it('merges preset metros first and dedupes discovered overlaps', () => {
    const options = mergeSocialMetroOptions(
      [TEST_SEO_METRO_DALLAS, TEST_SEO_METRO_CHICAGO],
      (city, state) => `${city}, ${state}`
    )

    expect(options[0].slug).toBe('chicago-il')
    expect(options.map((option) => option.slug)).toEqual(['chicago-il', 'dallas-tx', 'houston-tx', 'phoenix-az', 'atlanta-ga', 'austin-tx', 'louisville-ky'])
  })

  it('appends additional discovered metros alphabetically after presets', () => {
    const options = mergeSocialMetroOptions(
      [
        { slug: 'naperville-il', city: 'Naperville', state: 'IL', timezone: 'America/Chicago', minActiveListings: 25 },
        { slug: 'aurora-il', city: 'Aurora', state: 'IL', timezone: 'America/Chicago', minActiveListings: 25 },
      ],
      (city, state) => `${city}, ${state}`
    )

    const presetCount = listSocialReportRankingPresetSlugs().length
    expect(options).toHaveLength(presetCount + 2)
    expect(options[presetCount]?.slug).toBe('aurora-il')
    expect(options[presetCount + 1]?.slug).toBe('naperville-il')
  })
})
