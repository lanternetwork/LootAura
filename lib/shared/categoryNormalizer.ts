/**
 * Category parameter normalization utilities
 * Ensures consistent parsing and serialization of category filters
 * Handles both canonical 'categories' and legacy 'cat' parameters
 */

/**
 * Normalizes category parameters to a consistent format
 * @param categories - CSV string, array, or null/undefined
 * @returns Sorted, deduplicated array of category strings
 */
export function normalizeCategories(categories: string | string[] | null | undefined): string[] {
  if (!categories) return []
  
  let categoryArray: string[]
  
  if (typeof categories === 'string') {
    // Parse CSV string
    categoryArray = categories.split(',').map(c => c.trim()).filter(Boolean)
  } else if (Array.isArray(categories)) {
    // Already an array
    categoryArray = categories.filter(c => c && c.trim().length > 0)
  } else {
    return []
  }
  
  // Deduplicate and sort for consistent equality checks
  return [...new Set(categoryArray.map(c => c.trim()))].sort()
}

/**
 * Serializes category array to CSV string for URL parameters
 * @param categories - Array of category strings
 * @returns CSV string or empty string if no categories
 */
export function serializeCategories(categories: string[]): string {
  if (!categories || categories.length === 0) return ''
  return categories.join(',')
}

/**
 * Checks if two category arrays are equal (for suppression logic)
 * @param a - First category array
 * @param b - Second category array
 * @returns True if arrays contain the same categories
 */
export function categoriesEqual(a: string[], b: string[]): boolean {
  const normalizedA = normalizeCategories(a)
  const normalizedB = normalizeCategories(b)
  
  if (normalizedA.length !== normalizedB.length) return false
  
  return normalizedA.every((cat, index) => cat === normalizedB[index])
}

/**
 * Normalizes filter objects for equality comparison
 * @param filters - Filter object with categories and other properties
 * @returns Normalized filter object
 */
export function normalizeFilters(filters: {
  categories?: string | string[]
  city?: string
  dateRange?: string
  [key: string]: any
}): {
  categories: string[]
  city?: string
  dateRange?: string
  [key: string]: any
} {
  return {
    ...filters,
    categories: normalizeCategories(filters.categories),
    // Remove empty/undefined values for cleaner comparison
    ...(filters.city && { city: filters.city }),
    ...(filters.dateRange && filters.dateRange !== 'any' && { dateRange: filters.dateRange })
  }
}

/**
 * Checks if two filter objects are equal (for suppression logic)
 * @param a - First filter object
 * @param b - Second filter object
 * @returns True if filters are equivalent
 */
export function filtersEqual(a: any, b: any): boolean {
  const normalizedA = normalizeFilters(a)
  const normalizedB = normalizeFilters(b)
  
  // Compare categories
  if (!categoriesEqual(normalizedA.categories, normalizedB.categories)) return false
  
  // Compare other relevant filters
  const relevantKeys = ['city', 'dateRange']
  for (const key of relevantKeys) {
    if (normalizedA[key] !== normalizedB[key]) return false
  }
  
  return true
}

/**
 * Normalizes category parameters from URL search params or filter objects
 * Handles both canonical 'categories' and legacy 'cat' parameters
 * @param params - Search params object or filter object
 * @returns Normalized categories array
 */
export function normalizeCategoryParams(params: URLSearchParams | { [key: string]: any }): { categories: string[] } {
  let categories: string[] = []
  
  if (params instanceof URLSearchParams) {
    // Handle URLSearchParams
    const categoriesParam = params.get('categories')
    const catParam = params.get('cat') // Legacy support
    
    if (categoriesParam) {
      categories = normalizeCategories(categoriesParam)
    } else if (catParam) {
      // Legacy support: migrate cat to categories
      categories = normalizeCategories(catParam)
    }
  } else {
    // Handle filter object
    if (params.categories) {
      categories = normalizeCategories(params.categories)
    } else if (params.cat) {
      // Legacy support: migrate cat to categories
      categories = normalizeCategories(params.cat)
    }
  }
  
  return { categories }
}

/**
 * Builds URL search params with canonical 'categories' parameter
 * Never emits legacy 'cat' parameter
 * @param categories - Array of category strings
 * @param existingParams - Existing URLSearchParams to merge with
 * @returns URLSearchParams with canonical categories parameter
 */
export function buildCategoryParams(categories: string[], existingParams?: URLSearchParams): URLSearchParams {
  const params = existingParams ? new URLSearchParams(existingParams) : new URLSearchParams()
  
  // Remove legacy 'cat' parameter if it exists
  params.delete('cat')
  
  // Add canonical 'categories' parameter if categories exist
  if (categories.length > 0) {
    params.set('categories', serializeCategories(categories))
  } else {
    params.delete('categories')
  }
  
  return params
}
