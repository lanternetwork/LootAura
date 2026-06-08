import type { SeoMetro } from '@/lib/seo/types'

/**
 * Rank metros by weekend active count (desc), tie-break slug ascending.
 * Rank 1 = highest count.
 */
export function computeCityRankBySlug(
  metros: SeoMetro[],
  countsBySlug: Record<string, number>,
  targetSlug: string
): number {
  const sorted = metros
    .map((metro) => ({
      slug: metro.slug,
      count: countsBySlug[metro.slug] ?? 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.slug.localeCompare(b.slug)
    })

  const index = sorted.findIndex((entry) => entry.slug === targetSlug)
  return index >= 0 ? index + 1 : sorted.length
}
