/**
 * Street name normalization for address matching
 * Handles abbreviations, directionals, and produces regex patterns
 */

/**
 * Expand common street type abbreviations
 */
const STREET_TYPE_EXPANSIONS: Record<string, string> = {
  hwy: 'highway',
  rd: 'road',
  st: 'street',
  ave: 'avenue',
  av: 'avenue',
  blvd: 'boulevard',
  pkwy: 'parkway',
  dr: 'drive',
  ln: 'lane',
  ct: 'court',
  cir: 'circle',
  ter: 'terrace',
  pl: 'place',
  expy: 'expressway',
  fwy: 'freeway'
}

/**
 * Expand directional abbreviations
 */
const DIRECTIONAL_EXPANSIONS: Record<string, string> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest'
}

/**
 * Normalize street name for matching
 * - Lowercase
 * - Strip punctuation
 * - Collapse whitespace
 * - Expand common abbreviations
 */
export function normalizeStreetName(street: string): string {
  // Lowercase and strip punctuation
  let normalized = street.toLowerCase().replace(/[^\w\s]/g, ' ')
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim()
  
  // Split into tokens
  const tokens = normalized.split(/\s+/)
  
  // Expand abbreviations
  const expanded = tokens.map(token => {
    // Check street type abbreviations
    if (STREET_TYPE_EXPANSIONS[token]) {
      return STREET_TYPE_EXPANSIONS[token]
    }
    // Check directional abbreviations
    if (DIRECTIONAL_EXPANSIONS[token]) {
      return DIRECTIONAL_EXPANSIONS[token]
    }
    return token
  })
  
  return expanded.join(' ')
}

/**
 * Build a case-insensitive regex pattern for matching street names
 * Handles token order variations and partial matches
 */
export function buildStreetRegex(normalizedStreet: string): string {
  const tokens = normalizedStreet.split(/\s+/).filter(Boolean)
  
  if (tokens.length === 0) {
    return '.*'
  }
  
  // Escape special regex characters in tokens
  const escapedTokens = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  
  // Build pattern that matches tokens in order (with optional whitespace)
  // This allows for variations like "main street" matching "main st" after normalization
  const pattern = escapedTokens.join('\\s+')
  
  return pattern
}

/**
 * Extract numeric prefix and street from query
 * Returns null if query doesn't match pattern
 */
export function parseDigitsStreetQuery(query: string): { num: string; street: string } | null {
  // Match: 1-8 digits, whitespace, then street text starting with letter
  const match = query.match(/^(?<num>\d{1,8})\s+(?<street>[A-Za-z].+)$/)
  
  if (!match || !match.groups) {
    return null
  }
  
  return {
    num: match.groups.num,
    street: match.groups.street.trim()
  }
}

