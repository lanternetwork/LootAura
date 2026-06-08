/**
 * Rank preset metros by viewport-bounded weekend active count (desc), tie-break slug ascending.
 * Rank 1 = highest count. Returns null when target is not in the ranking pool.
 */
export function computeCityRankAmongPresets(
  rankingPresetSlugs: string[],
  countsBySlug: Record<string, number>,
  targetSlug: string
): number | null {
  const normalizedTarget = targetSlug.trim().toLowerCase()
  if (!rankingPresetSlugs.includes(normalizedTarget)) {
    return null
  }

  const sorted = rankingPresetSlugs
    .map((slug) => ({
      slug,
      count: countsBySlug[slug] ?? 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.slug.localeCompare(b.slug)
    })

  const index = sorted.findIndex((entry) => entry.slug === normalizedTarget)
  return index >= 0 ? index + 1 : null
}

/** @deprecated use computeCityRankAmongPresets for viewport-SOT social reports */
export function computeCityRankBySlug(
  metros: Array<{ slug: string }>,
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
