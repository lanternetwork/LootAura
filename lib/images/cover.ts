export type CoverUrl = { url: string; alt: string; placeholder?: string }

/** Picks the best display image for a sale card/detail. */
export function getSaleCoverUrl(sale: { title?: string; address?: string; cover_image_url?: string | null; images?: string[] | null }): CoverUrl | null {
  // Check cover_image_url first (explicit cover image)
  if (sale?.cover_image_url) {
    return { url: sale.cover_image_url, alt: `${sale.title ?? 'Sale'} cover` }
  }
  
  // Fallback to first image in images array
  const images = sale?.images
  if (images && Array.isArray(images) && images.length > 0) {
    const first = images[0]
    if (first && typeof first === 'string' && first.trim().length > 0) {
      return { url: first, alt: `${sale.title ?? 'Sale'} photo` }
    }
  }
  
  return null
}

