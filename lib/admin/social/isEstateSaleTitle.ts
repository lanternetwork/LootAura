/** Heuristic estate-sale detection from listing title (social report metrics only). */
export function isEstateSaleTitle(title: string | null | undefined): boolean {
  const normalized = title?.trim().toLowerCase() ?? ''
  if (!normalized) return false

  return (
    /\bestate\s+sale\b/.test(normalized) ||
    /\bestate\s+liquidation\b/.test(normalized) ||
    /\bestate\s+auction\b/.test(normalized) ||
    /\bestate\s+clearance\b/.test(normalized) ||
    /\bliving\s+estate\b/.test(normalized) ||
    /\bwhole\s+home\s+estate\b/.test(normalized) ||
    /\bon\s+site\s+estate\b/.test(normalized)
  )
}

export function countEstateSalesFromTitles(titles: Array<string | null | undefined>): number {
  return titles.filter((title) => isEstateSaleTitle(title)).length
}
