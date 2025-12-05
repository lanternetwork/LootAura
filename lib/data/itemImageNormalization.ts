/**
 * Item Image Normalization Utilities
 * 
 * Canonical model:
 * - `images` (TEXT[]) is the primary field - array of image URLs
 * - `image_url` (TEXT) is kept for backward compatibility and should equal `images[0]` when images exist
 * 
 * This ensures consistency across all write paths and makes the base table authoritative.
 */

export interface ItemImageInput {
  /** Single image URL (legacy format) */
  image_url?: string | null
  /** Array of image URLs (preferred format) */
  images?: string[] | null
}

export interface NormalizedItemImages {
  /** Primary: Array of image URLs (first element is display image) */
  images: string[] | null
  /** Backward compatibility: First image URL or provided image_url */
  image_url: string | null
}

/**
 * Normalizes item image input to canonical format.
 * 
 * Rules:
 * - If `images` array is provided and non-empty, use it as primary source
 * - If only `image_url` is provided, convert to `images: [image_url]`
 * - If both are provided, prefer `images` array but ensure `image_url` matches first element
 * - Empty strings are treated as null
 * - Returns both `images` and `image_url` for database writes
 * 
 * @param input - Image input from API request body
 * @returns Normalized image fields for database insertion/update
 */
export function normalizeItemImages(input: ItemImageInput): NormalizedItemImages {
  // Normalize images array: filter out empty strings and nulls
  const imagesArray = Array.isArray(input.images) && input.images.length > 0
    ? input.images.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
    : []

  // Normalize image_url: treat empty string as null
  const imageUrl = input.image_url && typeof input.image_url === 'string' && input.image_url.trim().length > 0
    ? input.image_url.trim()
    : null

  // Determine canonical images array
  // Prefer provided images array, fallback to image_url converted to array
  const normalizedImages = imagesArray.length > 0
    ? imagesArray
    : (imageUrl ? [imageUrl] : null)

  // Determine canonical image_url
  // Prefer provided image_url if it exists, otherwise use first element of images array
  const normalizedImageUrl = imageUrl !== null
    ? imageUrl
    : (normalizedImages && normalizedImages.length > 0 ? normalizedImages[0] : null)

  return {
    images: normalizedImages,
    image_url: normalizedImageUrl,
  }
}

