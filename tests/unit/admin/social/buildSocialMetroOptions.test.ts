import { describe, it, expect } from 'vitest'
import { buildSocialMetroOptions } from '@/lib/admin/social/buildSocialCityReport'
import { listSocialReportRankingPresetSlugs } from '@/lib/admin/social/socialReportViewportPresets'
import {
  geographyBySlugFromRows,
  TEST_GEO_CHICAGO,
  TEST_SOCIAL_PRESET_GEOGRAPHY,
} from '../../seo/metroGeographyTestFixtures'

describe('buildSocialMetroOptions', () => {
  const geographyBySlug = geographyBySlugFromRows(TEST_SOCIAL_PRESET_GEOGRAPHY)

  it('always includes all preset metros when discovery is empty', () => {
    const options = buildSocialMetroOptions([], geographyBySlug)
    expect(options.map((option) => option.slug)).toEqual(listSocialReportRankingPresetSlugs())
  })

  it('dedupes discovered metros that overlap presets', () => {
    const options = buildSocialMetroOptions(
      [
        {
          slug: 'chicago-il',
          city: 'Chicago Heights',
          state: 'IL',
          timezone: 'America/Chicago',
          minActiveListings: 25,
        },
      ],
      geographyBySlug
    )

    expect(options.filter((option) => option.slug === 'chicago-il')).toHaveLength(1)
    expect(options[0].city).toBe('Chicago')
  })
})
