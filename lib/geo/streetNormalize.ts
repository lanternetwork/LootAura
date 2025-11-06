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
 * Build a case-insensitive token-AND regex pattern for matching street names
 * All tokens must match (in any order), with support for abbreviations
 * 
 * Note: Overpass regex may not support lookaheads, so we use a simpler pattern
 * that matches all tokens with wildcards between them. Results are filtered
 * afterward to ensure all tokens are present.
 * 
 * Pattern: (?i).*token1.*token2.* (simplified for Overpass compatibility)
 * For full token-AND semantics, use buildStreetTokenAndRegex instead
 */
export function buildStreetRegex(normalizedStreet: string): string {
  const tokens = normalizedStreet.split(/\s+/).filter(Boolean)
  
  if (tokens.length === 0) {
    return '.*'
  }
  
  // Build pattern that matches all tokens (order doesn't matter for basic matching)
  // We'll use a simple pattern that matches tokens with .* between them
  // Overpass may not support lookaheads, so we use a simpler approach
  const patterns: string[] = []
  
  for (const token of tokens) {
    // Escape special regex characters
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    
    // Check if this token has an abbreviation variant
    let tokenPattern = escapedToken
    
    // Find abbreviation for this token (reverse lookup)
    const abbreviation = Object.entries(STREET_TYPE_EXPANSIONS).find(
      ([_abbr, full]) => full === token
    )?.[0]
    
    if (abbreviation) {
      // Support both full form and abbreviation
      const escapedAbbr = abbreviation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      tokenPattern = `(${escapedToken}|${escapedAbbr})`
    } else {
      // Check for directional abbreviations
      const dirAbbreviation = Object.entries(DIRECTIONAL_EXPANSIONS).find(
        ([_abbr, full]) => full === token
      )?.[0]
      
      if (dirAbbreviation) {
        const escapedDirAbbr = dirAbbreviation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        tokenPattern = `(${escapedToken}|${escapedDirAbbr})`
      }
    }
    
    // Match token as whole word: \b...\b
    patterns.push(`\\b${tokenPattern}\\b`)
  }
  
  // Build pattern: (?i).*token1.*token2.* (all tokens must appear)
  // This is simpler than lookaheads but still requires all tokens
  return `(?i).*${patterns.join('.*')}.*`
}

/**
 * Build a full token-AND regex pattern with lookaheads (for use in post-filtering)
 * Pattern: (?i)(?=.*\btoken1\b)(?=.*\b(token2|alt2)\b)....*
 * This ensures all tokens match in any order
 */
export function buildStreetTokenAndRegex(normalizedStreet: string): string {
  const tokens = normalizedStreet.split(/\s+/).filter(Boolean)
  
  if (tokens.length === 0) {
    return '.*'
  }
  
  // Build token-AND pattern: each token must appear (order doesn't matter)
  const patterns: string[] = []
  
  for (const token of tokens) {
    // Escape special regex characters
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    
    // Check if this token has an abbreviation variant
    let tokenPattern = escapedToken
    
    // Find abbreviation for this token (reverse lookup)
    const abbreviation = Object.entries(STREET_TYPE_EXPANSIONS).find(
      ([_abbr, full]) => full === token
    )?.[0]
    
    if (abbreviation) {
      // Support both full form and abbreviation
      const escapedAbbr = abbreviation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      tokenPattern = `(${escapedToken}|${escapedAbbr})`
    } else {
      // Check for directional abbreviations
      const dirAbbreviation = Object.entries(DIRECTIONAL_EXPANSIONS).find(
        ([_abbr, full]) => full === token
      )?.[0]
      
      if (dirAbbreviation) {
        const escapedDirAbbr = dirAbbreviation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        tokenPattern = `(${escapedToken}|${escapedDirAbbr})`
      }
    }
    
    // Add positive lookahead: (?=.*\btoken\b) - token must appear as whole word
    patterns.push(`(?=.*\\b${tokenPattern}\\b)`)
  }
  
  // Combine: (?i) for case-insensitive, all lookaheads, then .* to match the full string
  return `(?i)${patterns.join('')}.*`
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

