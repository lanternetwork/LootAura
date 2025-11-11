/**
 * Social links normalization and validation utilities
 */

export const SUPPORTED_PROVIDERS = [
  'twitter',
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'threads',
  'pinterest',
  'linkedin',
  'website',
] as const

export type SocialProvider = typeof SUPPORTED_PROVIDERS[number]

export type SocialLinks = {
  [K in SocialProvider]?: string
}

/**
 * Normalize a handle or URL to a canonical URL for a given provider
 */
function normalizeProviderUrl(provider: SocialProvider, input: string): string | null {
  if (!input || typeof input !== 'string') return null
  
  const trimmed = input.trim()
  if (!trimmed) return null

  // If already a full URL, validate and return
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // Basic URL validation
    try {
      const url = new URL(trimmed)
      // For website, allow any valid URL
      if (provider === 'website') {
        return url.href
      }
      // For other providers, validate domain matches
      const domain = url.hostname.toLowerCase()
      const expectedDomains: Record<SocialProvider, string[]> = {
        twitter: ['twitter.com', 'x.com'],
        instagram: ['instagram.com', 'www.instagram.com'],
        facebook: ['facebook.com', 'www.facebook.com', 'fb.com', 'www.fb.com'],
        tiktok: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
        youtube: ['youtube.com', 'www.youtube.com', 'youtu.be'],
        threads: ['threads.net', 'www.threads.net'],
        pinterest: ['pinterest.com', 'www.pinterest.com'],
        linkedin: ['linkedin.com', 'www.linkedin.com'],
        website: [], // website accepts any domain
      }
      
      const allowed = expectedDomains[provider]
      if (provider === 'website' || allowed.some(d => domain === d || domain.endsWith('.' + d))) {
        return url.href
      }
    } catch {
      // Invalid URL, will fall through to handle normalization
    }
  }

  // Extract handle from URL if it looks like a URL
  let handle = trimmed
  if (trimmed.includes('/')) {
    // Try to extract handle from common URL patterns
    const patterns: Record<SocialProvider, RegExp[]> = {
      twitter: [new RegExp('twitter\\.com/([^/?]+)', 'i'), new RegExp('x\\.com/([^/?]+)', 'i')],
      instagram: [new RegExp('instagram\\.com/([^/?]+)', 'i')],
      facebook: [new RegExp('facebook\\.com/([^/?]+)', 'i'), new RegExp('fb\\.com/([^/?]+)', 'i')],
      tiktok: [new RegExp('tiktok\\.com/@?([^/?]+)', 'i')],
      youtube: [new RegExp('youtube\\.com/@?([^/?]+)', 'i'), new RegExp('youtu\\.be/([^/?]+)', 'i')],
      threads: [new RegExp('threads\\.net/@?([^/?]+)', 'i')],
      pinterest: [new RegExp('pinterest\\.com/([^/?]+)', 'i')],
      linkedin: [new RegExp('linkedin\\.com/(in|company)/([^/?]+)', 'i')],
      website: [],
    }
    
    const providerPatterns = patterns[provider]
    for (const pattern of providerPatterns) {
      const match = trimmed.match(pattern)
      if (match) {
        handle = match[match.length - 1] // Get last capture group
        break
      }
    }
  }

  // Remove @ prefix if present
  handle = handle.replace(/^@+/, '')
  
  // Basic validation: alphanumeric, underscore, hyphen, dot
  if (!/^[a-zA-Z0-9._-]+$/.test(handle)) {
    return null
  }

  // Build canonical URL
  switch (provider) {
    case 'twitter':
      return `https://twitter.com/${handle}`
    case 'instagram':
      return `https://instagram.com/${handle}`
    case 'facebook':
      return `https://facebook.com/${handle}`
    case 'tiktok':
      return `https://tiktok.com/@${handle}`
    case 'youtube':
      return `https://youtube.com/@${handle}`
    case 'threads':
      return `https://www.threads.net/@${handle}`
    case 'pinterest':
      return `https://pinterest.com/${handle}`
    case 'linkedin':
      // If it looks like a company or personal URL, keep structure
      if (trimmed.includes('/company/') || trimmed.includes('/in/')) {
        try {
          const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
          return url.href
        } catch {
          return `https://www.linkedin.com/in/${handle}`
        }
      }
      return `https://www.linkedin.com/in/${handle}`
    case 'website':
      // Add https:// if missing
      if (!handle.startsWith('http://') && !handle.startsWith('https://')) {
        return `https://${handle}`
      }
      return handle
    default:
      return null
  }
}

/**
 * Normalize social links object, converting handles to canonical URLs
 */
export function normalizeSocialLinks(input: Partial<SocialLinks>): SocialLinks {
  const normalized: SocialLinks = {}
  
  for (const provider of SUPPORTED_PROVIDERS) {
    const value = input[provider]
    if (value) {
      const normalizedUrl = normalizeProviderUrl(provider, value)
      if (normalizedUrl) {
        normalized[provider] = normalizedUrl
      }
    }
  }
  
  return normalized
}

