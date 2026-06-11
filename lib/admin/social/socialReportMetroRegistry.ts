import { SEO_METRO_MIN_ACTIVE_LISTINGS } from '@/lib/seo/metroCatalog'
import type { SeoMetro } from '@/lib/seo/types'
import type { SocialMetroOption } from '@/lib/admin/social/socialCityReportTypes'
import { SOCIAL_REPORT_VIEWPORT_PRESETS } from '@/lib/admin/social/socialReportViewportPresets'

/** Curated social report metros — authoritative for /admin/social regardless of discovery. */
export function listSocialReportRegistryMetros(): SeoMetro[] {
  return SOCIAL_REPORT_VIEWPORT_PRESETS.map((preset) => ({
    slug: preset.citySlug,
    city: preset.city,
    state: preset.state,
    timezone: preset.timezone,
    minActiveListings: SEO_METRO_MIN_ACTIVE_LISTINGS,
  }))
}

/** Registry first, then discovered catalog (discovery cannot block presets). */
export function resolveSocialReportMetro(
  slug: string,
  discoveredMetros: SeoMetro[]
): SeoMetro | undefined {
  const normalizedSlug = slug.trim().toLowerCase()
  const fromRegistry = listSocialReportRegistryMetros().find((metro) => metro.slug === normalizedSlug)
  if (fromRegistry) {
    return fromRegistry
  }
  return discoveredMetros.find((metro) => metro.slug === normalizedSlug)
}

/** Preset metros first (registry order), then additional discovered metros alphabetically. */
export function mergeSocialMetroOptions(
  discoveredMetros: SeoMetro[],
  formatLabel: (city: string, state: string) => string
): SocialMetroOption[] {
  const registry = listSocialReportRegistryMetros()
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
