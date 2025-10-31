export type CoverUrl = { url: string; alt: string; placeholder?: string }

/** Picks the best display image for a sale card/detail. */
export function getSaleCoverUrl(sale: { title?: string; address?: string; cover_image_url?: string | null; images?: string[] | null }): CoverUrl | null {
  if (sale?.cover_image_url) {
    return { url: sale.cover_image_url, alt: `${sale.title ?? 'Sale'} cover` }
  }
  const first = sale?.images?.[0]
  if (first) {
    return { url: first, alt: `${sale.title ?? 'Sale'} photo` }
  }
  return null
}

