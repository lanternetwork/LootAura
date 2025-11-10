import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildShareTargets } from '@/lib/share/buildShareUrls'

describe('buildShareTargets', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL

  beforeEach(() => {
    // Reset environment
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  afterEach(() => {
    // Restore original env
    if (originalEnv) {
      process.env.NEXT_PUBLIC_SITE_URL = originalEnv
    }
  })

  it('should build share targets with default UTM params', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
    })

    expect(targets).toBeDefined()
    expect(Array.isArray(targets)).toBe(true)
    expect(targets.length).toBeGreaterThan(0)

    // Check that URLs include UTM params (URL-encoded)
    const twitterTarget = targets.find(t => t.id === 'twitter')
    expect(twitterTarget).toBeDefined()
    // Extract the url parameter from the Twitter share URL
    const urlMatch = twitterTarget?.url.match(/url=([^&]+)/)
    expect(urlMatch).toBeDefined()
    if (urlMatch) {
      const decodedUrl = decodeURIComponent(urlMatch[1])
      expect(decodedUrl).toContain('utm_source=share')
      expect(decodedUrl).toContain('utm_medium=social')
      expect(decodedUrl).toContain('utm_campaign=sale')
    }
  })

  it('should normalize relative URLs to absolute', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
    })

    const twitterTarget = targets.find(t => t.id === 'twitter')
    expect(twitterTarget?.url).toMatch(/^https?:\/\//)
  })

  it('should use NEXT_PUBLIC_SITE_URL when available', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
    })

    const twitterTarget = targets.find(t => t.id === 'twitter')
    // Extract the url parameter from the Twitter share URL
    const urlMatch = twitterTarget?.url.match(/url=([^&]+)/)
    expect(urlMatch).toBeDefined()
    if (urlMatch) {
      const decodedUrl = decodeURIComponent(urlMatch[1])
      expect(decodedUrl).toContain('https://example.com')
    }
  })

  it('should include copy link target', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
    })

    const copyTarget = targets.find(t => t.id === 'copy')
    expect(copyTarget).toBeDefined()
    expect(copyTarget?.action).toBe('copy')
    expect(copyTarget?.label).toBe('Copy Link')
  })

  it('should build Twitter share URL correctly', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
    })

    const twitterTarget = targets.find(t => t.id === 'twitter')
    expect(twitterTarget).toBeDefined()
    expect(twitterTarget?.url).toContain('twitter.com/intent/tweet')
    expect(twitterTarget?.url).toContain('text=Test%20Sale')
    expect(twitterTarget?.action).toBe('link')
  })

  it('should build Facebook share URL correctly', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
    })

    const facebookTarget = targets.find(t => t.id === 'facebook')
    expect(facebookTarget).toBeDefined()
    expect(facebookTarget?.url).toContain('facebook.com/sharer/sharer.php')
    expect(facebookTarget?.action).toBe('link')
  })

  it('should build Reddit share URL correctly', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
    })

    const redditTarget = targets.find(t => t.id === 'reddit')
    expect(redditTarget).toBeDefined()
    expect(redditTarget?.url).toContain('reddit.com/submit')
    expect(redditTarget?.url).toContain('title=Test%20Sale')
    expect(redditTarget?.action).toBe('link')
  })

  it('should mark WhatsApp as mobile-only', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
    })

    const whatsappTarget = targets.find(t => t.id === 'whatsapp')
    expect(whatsappTarget).toBeDefined()
    expect(whatsappTarget?.mobileOnly).toBe(true)
    expect(whatsappTarget?.url).toContain('api.whatsapp.com/send')
  })

  it('should mark SMS as mobile-only', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
    })

    const smsTarget = targets.find(t => t.id === 'sms')
    expect(smsTarget).toBeDefined()
    expect(smsTarget?.mobileOnly).toBe(true)
    expect(smsTarget?.url).toMatch(/^sms:/)
  })

  it('should build email share URL correctly', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
      text: 'Check this out!',
    })

    const emailTarget = targets.find(t => t.id === 'email')
    expect(emailTarget).toBeDefined()
    expect(emailTarget?.url).toMatch(/^mailto:/)
    expect(emailTarget?.url).toContain('subject=Test%20Sale')
    expect(emailTarget?.url).toContain('body=')
    expect(emailTarget?.action).toBe('link')
  })

  it('should allow custom UTM params', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Test Sale',
      utm: {
        source: 'custom',
        medium: 'email',
        campaign: 'promo',
      },
    })

    const twitterTarget = targets.find(t => t.id === 'twitter')
    // Extract the url parameter from the Twitter share URL
    const urlMatch = twitterTarget?.url.match(/url=([^&]+)/)
    expect(urlMatch).toBeDefined()
    if (urlMatch) {
      const decodedUrl = decodeURIComponent(urlMatch[1])
      expect(decodedUrl).toContain('utm_source=custom')
      expect(decodedUrl).toContain('utm_medium=email')
      expect(decodedUrl).toContain('utm_campaign=promo')
    }
  })

  it('should encode special characters in URLs', () => {
    const targets = buildShareTargets({
      url: '/sales/test-id',
      title: 'Sale & More!',
      text: 'Check this out: "Great deals"',
    })

    const twitterTarget = targets.find(t => t.id === 'twitter')
    expect(twitterTarget?.url).toContain(encodeURIComponent('Sale & More!'))
    
    const emailTarget = targets.find(t => t.id === 'email')
    expect(emailTarget?.url).toContain(encodeURIComponent('Sale & More!'))
  })

  it('should handle absolute URLs', () => {
    const targets = buildShareTargets({
      url: 'https://example.com/sales/test-id',
      title: 'Test Sale',
    })

    const twitterTarget = targets.find(t => t.id === 'twitter')
    // Extract the url parameter from the Twitter share URL
    const urlMatch = twitterTarget?.url.match(/url=([^&]+)/)
    expect(urlMatch).toBeDefined()
    if (urlMatch) {
      const decodedUrl = decodeURIComponent(urlMatch[1])
      expect(decodedUrl).toContain('https://example.com/sales/test-id')
    }
  })
})

