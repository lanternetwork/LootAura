import { describe, it, expect } from 'vitest'
import { normalizeSocialLinks } from '@/lib/profile/social'

describe('normalizeSocialLinks', () => {
  it('should strip @ prefix from handles', () => {
    const input = {
      twitter: '@johndoe',
      instagram: '@johndoe',
      tiktok: '@johndoe',
    }

    const result = normalizeSocialLinks(input)

    expect(result.twitter).toBe('https://twitter.com/johndoe')
    expect(result.instagram).toBe('https://instagram.com/johndoe')
    expect(result.tiktok).toBe('https://tiktok.com/@johndoe')
  })

  it('should preserve https URLs', () => {
    const input = {
      twitter: 'https://twitter.com/johndoe',
      website: 'https://example.com',
      linkedin: 'https://www.linkedin.com/in/johndoe',
    }

    const result = normalizeSocialLinks(input)

    expect(result.twitter).toBe('https://twitter.com/johndoe')
    expect(result.website).toBe('https://example.com')
    expect(result.linkedin).toBe('https://www.linkedin.com/in/johndoe')
  })

  it('should normalize x.com URLs to twitter.com', () => {
    const input = {
      twitter: 'https://x.com/johndoe',
    }

    const result = normalizeSocialLinks(input)

    expect(result.twitter).toBe('https://twitter.com/johndoe')
  })

  it('should remove trailing slashes from website URLs', () => {
    const input = {
      website: 'https://example.com/',
    }

    const result = normalizeSocialLinks(input)

    expect(result.website).toBe('https://example.com')
  })

  it('should reject unknown keys', () => {
    const input = {
      twitter: 'johndoe',
      unknownKey: 'should-be-ignored',
      anotherUnknown: 'also-ignored',
    } as any

    const result = normalizeSocialLinks(input)

    expect(result.twitter).toBe('https://twitter.com/johndoe')
    expect('unknownKey' in result).toBe(false)
    expect('anotherUnknown' in result).toBe(false)
  })

  it('should handle empty strings', () => {
    const input = {
      twitter: '',
      instagram: '  ',
      facebook: null,
    } as any

    const result = normalizeSocialLinks(input)

    expect(result.twitter).toBeUndefined()
    expect(result.instagram).toBeUndefined()
    expect(result.facebook).toBeUndefined()
  })

  it('should extract handles from URLs', () => {
    const input = {
      twitter: 'https://twitter.com/johndoe',
      instagram: 'https://instagram.com/johndoe',
      youtube: 'https://youtube.com/@johndoe',
    }

    const result = normalizeSocialLinks(input)

    expect(result.twitter).toBe('https://twitter.com/johndoe')
    expect(result.instagram).toBe('https://instagram.com/johndoe')
    expect(result.youtube).toBe('https://youtube.com/@johndoe')
  })

  it('should handle LinkedIn company URLs', () => {
    const input = {
      linkedin: 'https://www.linkedin.com/company/example',
    }

    const result = normalizeSocialLinks(input)

    expect(result.linkedin).toBe('https://www.linkedin.com/company/example')
  })

  it('should add https:// prefix to website URLs without scheme', () => {
    const input = {
      website: 'example.com',
    }

    const result = normalizeSocialLinks(input)

    expect(result.website).toBe('https://example.com')
  })

  it('should reject invalid handles', () => {
    const input = {
      twitter: 'invalid@#$handle',
      instagram: 'valid-handle',
    }

    const result = normalizeSocialLinks(input)

    expect(result.twitter).toBeUndefined()
    expect(result.instagram).toBe('https://instagram.com/valid-handle')
  })
})

