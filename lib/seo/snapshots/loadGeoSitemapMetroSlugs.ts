import { loadGeographyQualifiedOverrideSlugs } from '@/lib/seo/snapshots/loadSeoMetroGeography'
import { loadQualifiedMetroSlugs } from '@/lib/seo/snapshots/loadSeoQualifiedMetros'
import { getAdminDb } from '@/lib/supabase/clients'

/**
 * Geo sitemap slugs: qualified metros ∪ geography qualified_override when national emission is on.
 */
export async function loadGeoSitemapMetroSlugs(
  seoEmissionAllowed: boolean,
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<string[]> {
  if (!seoEmissionAllowed) {
    return []
  }

  const [qualified, overrideSlugs] = await Promise.all([
    loadQualifiedMetroSlugs(admin),
    loadGeographyQualifiedOverrideSlugs(admin),
  ])

  return [...new Set([...qualified, ...overrideSlugs])].sort((a, b) => a.localeCompare(b))
}
