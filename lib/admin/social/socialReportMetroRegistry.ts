import { geographyRowToSeoMetro } from '@/lib/seo/snapshots/loadSeoMetroGeography'
import type { SeoMetroGeographyRow } from '@/lib/seo/metroGeographyTypes'
import type { SeoMetro } from '@/lib/seo/types'
import type { SocialMetroOption } from '@/lib/admin/social/socialCityReportTypes'
import { listSocialReportRankingPresetSlugs } from '@/lib/admin/social/socialReportViewportPresets'

/** Curated social report metros — authoritative when present in seo_metro_geography. */
export function listSocialReportRegistryMetros(
  geographyBySlug: Map<string, SeoMetroGeographyRow>
): SeoMetro[] {
  return listSocialReportRankingPresetSlugs()
    .map((slug) => geographyBySlug.get(slug))
    .filter((row): row is SeoMetroGeographyRow => row != null)
    .map(geographyRowToSeoMetro)
}

/** Registry first, then discovered catalog (discovery cannot block presets). */
export function resolveSocialReportMetro(
  slug: string,
  discoveredMetros: SeoMetro[],
  geographyBySlug: Map<string, SeoMetroGeographyRow>
): SeoMetro | undefined {
  const normalizedSlug = slug.trim().toLowerCase()
  const fromRegistry = listSocialReportRegistryMetros(geographyBySlug).find(
    (metro) => metro.slug === normalizedSlug
  )
  if (fromRegistry) {
    return fromRegistry
  }
  return discoveredMetros.find((metro) => metro.slug === normalizedSlug)
}

/** Preset metros first (registry order), then additional discovered metros alphabetically. */
export function mergeSocialMetroOptions(
  discoveredMetros: SeoMetro[],
  geographyBySlug: Map<string, SeoMetroGeographyRow>,
  formatLabel: (city: string, state: string) => string
): SocialMetroOption[] {
  const registry = listSocialReportRegistryMetros(geographyBySlug)
  const presetSlugs = new Set(registry.map((metro) => metro.slug))

  const presetOptions: SocialMetroOption[] = registry.map((metro) => ({
    slug: metro.slug,
    city: metro.city,
    state: metro.state,
    label: formatLabel(metro.city, metro.state),
  }))

  const additionalOptions = discoveredMetros
    .filter((metro) => !presetSlugs.has(metro.slug))
    .map((metro) => ({
      slug: metro.slug,
      city: metro.city,
      state: metro.state,
      label: formatLabel(metro.city, metro.state),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return [...presetOptions, ...additionalOptions]
}
