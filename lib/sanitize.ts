import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

// Create a JSDOM window for server-side sanitization
const window = new JSDOM('').window
const purify = DOMPurify(window as any)

export interface SanitizeOptions {
  allowedTags?: string[]
  allowedAttributes?: Record<string, string[]>
  maxLength?: number
  stripHtml?: boolean
}

export function sanitizeHtml(input: string, options: SanitizeOptions = {}): string {
  if (!input || typeof input !== 'string') return ''

  const {
    allowedTags = ['b', 'i', 'em', 'strong', 'p', 'br'],
    allowedAttributes = {
      'a': ['href', 'title'],
      'img': ['src', 'alt', 'width', 'height']
    },
    maxLength = 10000,
    stripHtml = false
  } = options

  // Truncate if too long
  let sanitized = input.length > maxLength ? input.substring(0, maxLength) : input

  if (stripHtml) {
    // Remove all HTML tags - improved regex to handle nested tags
    sanitized = sanitized.replace(/<\/?[^>]+(>|$)/g, '')
  } else {
    // Sanitize HTML
    sanitized = purify.sanitize(sanitized, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: Object.keys(allowedAttributes),
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false
    })
  }

  return sanitized.trim()
}

export function sanitizeText(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== 'string') return ''

  // Remove HTML tags and normalize whitespace
  let sanitized = input
    .replace(/<\/?[^>]+(>|$)/g, '') // Remove HTML tags - improved regex
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim()
  }

  return sanitized
}

export function sanitizeUrl(input: string): string {
  if (!input || typeof input !== 'string') return ''

  try {
    const url = new URL(input)
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return ''
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /onload/i,
      /onerror/i,
      /onclick/i
    ]

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url.href)) {
        return ''
      }
    }

    // Remove trailing slash for consistency
    return url.href.replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function sanitizeEmail(input: string): string {
  if (!input || typeof input !== 'string') return ''

  // Basic email validation and sanitization
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const sanitized = input.trim().toLowerCase()

  if (!emailRegex.test(sanitized)) {
    return ''
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /onload/i,
    /onerror/i
  ]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      return ''
    }
  }

  return sanitized
}

export function sanitizePhone(input: string): string {
  if (!input || typeof input !== 'string') return ''

  // Remove all non-digit characters except + at the beginning
  let sanitized = input.replace(/[^\d+]/g, '')
  
  // Ensure + is only at the beginning
  if (sanitized.includes('+') && !sanitized.startsWith('+')) {
    sanitized = sanitized.replace(/\+/g, '')
  }

  // Basic validation (7-15 digits)
  const digits = sanitized.replace(/\+/g, '')
  if (digits.length < 7 || digits.length > 15) {
    return ''
  }

  return sanitized
}

export function sanitizeAddress(input: string): string {
  if (!input || typeof input !== 'string') return ''

  // Remove HTML tags and normalize
  const sanitized = input
    .replace(/<\/?[^>]+(>|$)/g, '') // Improved regex for HTML tag removal
    .replace(/\s+/g, ' ')
    .trim()

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /onload/i,
    /onerror/i,
    /onclick/i
  ]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      return ''
    }
  }

  return sanitized
}

export function sanitizeTags(input: string[]): string[] {
  if (!Array.isArray(input)) return []

  return input
    .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
    .map(tag => sanitizeText(tag.trim(), 50))
    .filter(tag => {
      if (tag.length === 0) return false
      // Filter out very long strings (likely spam)
      if (tag.length > 30) return false
      // Filter out XSS attempts
      const xssPatterns = [
        /alert\s*\(/i, 
        /xss/i, 
        /<script/i, 
        /javascript:/i,
        /on\w+\s*=/i,
        /<[^>]*>/i
      ]
      return !xssPatterns.some(pattern => pattern.test(tag))
    })
    .slice(0, 10) // Limit to 10 tags
}

export function sanitizeSearchQuery(input: string): string {
  if (!input || typeof input !== 'string') return ''

  // Remove HTML and normalize
  let sanitized = sanitizeText(input, 200)

  // Remove potentially dangerous characters
  sanitized = sanitized.replace(/[<>'"&]/g, '')

  // Remove XSS patterns using string methods instead of complex regex
  // Remove script tags by finding and removing them iteratively
  let scriptStart = sanitized.indexOf('<script')
  while (scriptStart !== -1) {
    const scriptEnd = sanitized.indexOf('</script>', scriptStart)
    if (scriptEnd !== -1) {
      sanitized = sanitized.substring(0, scriptStart) + sanitized.substring(scriptEnd + 9)
    } else {
      sanitized = sanitized.substring(0, scriptStart)
    }
    scriptStart = sanitized.indexOf('<script')
  }
  
  // Remove javascript: protocols using string methods
  let jsIndex = sanitized.toLowerCase().indexOf('javascript:')
  while (jsIndex !== -1) {
    sanitized = sanitized.substring(0, jsIndex) + sanitized.substring(jsIndex + 11)
    jsIndex = sanitized.toLowerCase().indexOf('javascript:')
  }
  
  // Remove common event handlers using string methods
  const eventHandlers = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur']
  for (const handler of eventHandlers) {
    let handlerIndex = sanitized.toLowerCase().indexOf(handler + '=')
    while (handlerIndex !== -1) {
      // Find the end of the attribute value
      const quoteStart = sanitized.indexOf('"', handlerIndex)
      const singleQuoteStart = sanitized.indexOf("'", handlerIndex)
      let quoteEnd = -1
      
      if (quoteStart !== -1 && (singleQuoteStart === -1 || quoteStart < singleQuoteStart)) {
        quoteEnd = sanitized.indexOf('"', quoteStart + 1)
      } else if (singleQuoteStart !== -1) {
        quoteEnd = sanitized.indexOf("'", singleQuoteStart + 1)
      }
      
      if (quoteEnd !== -1) {
        sanitized = sanitized.substring(0, handlerIndex) + sanitized.substring(quoteEnd + 1)
      } else {
        sanitized = sanitized.substring(0, handlerIndex)
      }
      handlerIndex = sanitized.toLowerCase().indexOf(handler + '=')
    }
  }
  
  // Remove alert() calls using string methods
  let alertIndex = sanitized.toLowerCase().indexOf('alert(')
  while (alertIndex !== -1) {
    const parenIndex = sanitized.indexOf(')', alertIndex)
    if (parenIndex !== -1) {
      sanitized = sanitized.substring(0, alertIndex) + sanitized.substring(parenIndex + 1)
    } else {
      sanitized = sanitized.substring(0, alertIndex)
    }
    alertIndex = sanitized.toLowerCase().indexOf('alert(')
  }
  
  // Remove HTML tags using simple angle bracket removal
  let tagStart = sanitized.indexOf('<')
  while (tagStart !== -1) {
    const tagEnd = sanitized.indexOf('>', tagStart)
    if (tagEnd !== -1) {
      sanitized = sanitized.substring(0, tagStart) + sanitized.substring(tagEnd + 1)
    } else {
      sanitized = sanitized.substring(0, tagStart)
    }
    tagStart = sanitized.indexOf('<')
  }

  return sanitized.trim()
}

// Validation helpers
export function isValidUuid(input: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(input)
}

export function isValidLatitude(lat: number): boolean {
  return typeof lat === 'number' && lat >= -90 && lat <= 90
}

export function isValidLongitude(lng: number): boolean {
  return typeof lng === 'number' && lng >= -180 && lng <= 180
}

export function isValidPrice(price: number): boolean {
  return typeof price === 'number' && price >= 0 && price <= 1000000
}

export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString)
  return !isNaN(date.getTime()) && date.getTime() > 0
}
