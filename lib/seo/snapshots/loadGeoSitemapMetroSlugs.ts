import { getSeededMajorMetroSlugs } from '@/lib/seo/seededMajorMetros'
import { loadQualifiedMetroSlugs } from '@/lib/seo/snapshots/loadSeoQualifiedMetros'
import { getAdminDb } from '@/lib/supabase/clients'

/**
 * Geo sitemap slugs: qualified metros ∪ seeded majors when national emission is on.
 */
export async function loadGeoSitemapMetroSlugs(
  seoEmissionAllowed: boolean,
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<string[]> {
  if (!seoEmissionAllowed) {
    return []
  }

  const [qualified, seeded] = await Promise.all([
    loadQualifiedMetroSlugs(admin),
    Promise.resolve(getSeededMajorMetroSlugs()),
  ])

  return [...new Set([...qualified, ...seeded])].sort((a, b) => a.localeCompare(b))
}
