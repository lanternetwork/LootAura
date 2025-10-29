export type CoverUrl = { url: string; alt: string; placeholder?: string };

/**
 * Picks the best display image for a sale card/detail.
 * Priority: cover_image_url -> first image in images array -> null (show placeholder)
 */
export function getSaleCoverUrl(sale: { 
  title?: string; 
  address?: string; 
  cover_image_url?: string | null; 
  images?: string[] | null 
}): CoverUrl | null {
  // First priority: explicit cover image
  if (sale.cover_image_url) {
    return { 
      url: sale.cover_image_url, 
      alt: `${sale.title ?? 'Sale'} cover` 
    };
  }
  
  // Second priority: first image in images array
  const first = sale.images?.[0];
  if (first) {
    return { 
      url: first, 
      alt: `${sale.title ?? 'Sale'} photo` 
    };
  }
  
  // No images available - UI will show neutral placeholder
  return null;
}
