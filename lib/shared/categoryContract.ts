/**
 * Category Contract - UI to DB mapping layer
 * Handles normalization and mapping between UI category tokens and DB values
 */

// Canonical UI category tokens
export const UI_CATEGORIES = [
  'furniture',
  'tools', 
  'toys',
  'books',
  'clothing',
  'electronics',
  'general',
  'home',
  'sports',
  'automotive'
] as const

export type UICategory = typeof UI_CATEGORIES[number]

// DB mapping cache (populated at runtime)
let dbMappingCache: Record<string, string> | null = null

/**
 * Normalize a category string (trim, lower, collapse spaces/hyphens)
 */
export function normalizeCat(s: string): string {
  if (!s || typeof s !== 'string') return ''
  
  return s
    .trim()
    .toLowerCase()
    .replace(/&/g, '') // remove ampersands first
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .replace(/-+/g, '-')  // collapse multiple hyphens
    .replace(/\s+/g, '-') // convert spaces to hyphens
}

/**
 * Map UI category tokens to DB values
 * @param uiSelected - Array of UI category tokens
 * @returns Array of DB category values
 */
export function toDbSet(uiSelected: string[]): string[] {
  if (!uiSelected || uiSelected.length === 0) return []
  
  // If no mapping cache, return normalized UI tokens as fallback
  if (!dbMappingCache) {
    console.warn('[CATEGORY CONTRACT] No DB mapping cache available, using normalized UI tokens')
    return uiSelected.map(normalizeCat).filter(Boolean)
  }
  
  const dbTokens: string[] = []
  const unmappedTokens: string[] = []
  
  for (const uiToken of uiSelected) {
    const normalized = normalizeCat(uiToken)
    const dbToken = dbMappingCache[normalized]
    
    if (dbToken) {
      dbTokens.push(dbToken)
    } else {
      // Fallback to normalized UI token
      dbTokens.push(normalized)
      unmappedTokens.push(normalized)
    }
  }
  
  if (unmappedTokens.length > 0) {
    console.warn('[CATEGORY CONTRACT] Unmapped UI tokens:', unmappedTokens)
  }
  
  return dbTokens
}

/**
 * Build DB mapping from category probe data
 * @param dbCategories - Array of { value, count } from DB probe
 */
export function buildDbMapping(dbCategories: Array<{ value: string; count: number }>): void {
  const mapping: Record<string, string> = {}
  
  for (const dbCat of dbCategories) {
    const normalized = normalizeCat(dbCat.value)
    
    // Try to find a matching UI category
    const matchingUI = UI_CATEGORIES.find(uiCat => 
      normalizeCat(uiCat) === normalized || 
      normalized.includes(normalizeCat(uiCat)) ||
      normalizeCat(uiCat).includes(normalized)
    )
    
    if (matchingUI) {
      mapping[normalizeCat(matchingUI)] = dbCat.value
    } else {
      // Direct mapping for exact matches
      mapping[normalized] = dbCat.value
    }
  }
  
  dbMappingCache = mapping
  console.log('[CATEGORY CONTRACT] Built DB mapping:', Object.keys(mapping).length, 'mappings')
}

/**
 * Get current DB mapping (for debugging)
 */
export function getDbMapping(): Record<string, string> | null {
  return dbMappingCache
}

/**
 * Check if a UI token has a DB mapping
 */
export function hasDbMapping(uiToken: string): boolean {
  if (!dbMappingCache) return false
  return normalizeCat(uiToken) in dbMappingCache
}

/**
 * Get all available UI categories
 */
export function getUICategories(): readonly string[] {
  return UI_CATEGORIES
}
