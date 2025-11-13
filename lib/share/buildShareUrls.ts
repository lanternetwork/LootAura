/**
 * Share URL builder utility
 * Builds share URLs for various social platforms with UTM tracking
 */

export interface ShareTarget {
  id: string
  label: string
  url: string
  mobileOnly?: boolean
  action?: 'copy' | 'link'
}

export interface ShareUrlOptions {
  url: string
  title: string
  text?: string
  utm?: {
    source?: string
    medium?: string
    campaign?: string
  }
}

/**
 * Append UTM parameters to a URL
 */
function appendUtm(url: string, defaults: { source: string; medium: string; campaign: string }, overrides?: { source?: string; medium?: string; campaign?: string }): string {
  const params = new URLSearchParams()
  const source = overrides?.source || defaults.source
  const medium = overrides?.medium || defaults.medium
  const campaign = overrides?.campaign || defaults.campaign

  params.set('utm_source', source)
  params.set('utm_medium', medium)
  params.set('utm_campaign', campaign)

  const urlObj = new URL(url)
  // Merge with existing params
  params.forEach((value, key) => {
    urlObj.searchParams.set(key, value)
  })

  return urlObj.toString()
}

/**
 * Normalize URL to absolute URL
 */
function normalizeUrl(url: string): string {
  // If already absolute, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // Get base URL from environment or fallback to location.origin
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!baseUrl && typeof window !== 'undefined') {
    baseUrl = window.location.origin
  }
  if (!baseUrl) {
    // Fallback for SSR or missing env
    if (process.env.NODE_ENV === 'development') {
      console.warn('[SHARE] NEXT_PUBLIC_SITE_URL not set, using fallback')
    }
    baseUrl = 'https://lootaura.app'
  }
  
  // Remove trailing slash from base URL
  const cleanBaseUrl = baseUrl.replace(/\/$/, '')
  
  // Ensure url starts with /
  const cleanUrl = url.startsWith('/') ? url : `/${url}`
  
  return `${cleanBaseUrl}${cleanUrl}`
}

/**
 * Encode text for URL or message body
 */
function encodeText(text: string): string {
  return encodeURIComponent(text)
}

/**
 * Build share targets for various platforms
 */
export function buildShareTargets(options: ShareUrlOptions): ShareTarget[] {
  const { url, title, text, utm } = options

  // Normalize URL to absolute
  const absoluteUrl = normalizeUrl(url)

  // Default UTM params
  const defaultUtm = {
    source: 'share',
    medium: 'social',
    campaign: 'sale',
  }

  // Build share URL with UTM params
  const shareUrl = appendUtm(absoluteUrl, defaultUtm, utm)

  // Build share text (title + optional text)
  const shareText = text || title
  const fullShareText = `${title}${text ? ` - ${text}` : ''}`

  const targets: ShareTarget[] = [
    {
      id: 'copy',
      label: 'Copy Link',
      url: shareUrl,
      action: 'copy',
    },
    {
      id: 'twitter',
      label: 'X (Twitter)',
      url: `https://twitter.com/intent/tweet?text=${encodeText(title)}&url=${encodeText(shareUrl)}`,
      action: 'link',
    },
    {
      id: 'facebook',
      label: 'Facebook',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeText(shareUrl)}`,
      action: 'link',
    },
    {
      id: 'reddit',
      label: 'Reddit',
      url: `https://www.reddit.com/submit?url=${encodeText(shareUrl)}&title=${encodeText(title)}`,
      action: 'link',
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      url: `https://api.whatsapp.com/send?text=${encodeText(fullShareText + ' ' + shareUrl)}`,
      action: 'link',
      mobileOnly: true,
    },
    {
      id: 'email',
      label: 'Email',
      url: `mailto:?subject=${encodeText(title)}&body=${encodeText(shareText + '\n' + shareUrl)}`,
      action: 'link',
    },
    {
      id: 'sms',
      label: 'SMS',
      url: `sms:?&body=${encodeText(fullShareText + ' ' + shareUrl)}`,
      action: 'link',
      mobileOnly: true,
    },
  ]

  return targets
}

