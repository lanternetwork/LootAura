import { describe, it, expect } from 'vitest'
import { normalizeSocialLinks, SUPPORTED_PROVIDERS } from '@/lib/profile/social'

describe('normalizeSocialLinks', () => {
  it('should normalize Twitter handles', () => {
    expect(normalizeSocialLinks({ twitter: 'johndoe' })).toEqual({
      twitter: 'https://twitter.com/johndoe',
    })
    expect(normalizeSocialLinks({ twitter: '@johndoe' })).toEqual({
      twitter: 'https://twitter.com/johndoe',
    })
    expect(normalizeSocialLinks({ twitter: 'https://twitter.com/johndoe' })).toEqual({
      twitter: 'https://twitter.com/johndoe',
    })
    expect(normalizeSocialLinks({ twitter: 'https://x.com/johndoe' })).toEqual({
      twitter: 'https://twitter.com/johndoe',
    })
  })

  it('should normalize Instagram handles', () => {
    expect(normalizeSocialLinks({ instagram: 'johndoe' })).toEqual({
      instagram: 'https://instagram.com/johndoe',
    })
    expect(normalizeSocialLinks({ instagram: '@johndoe' })).toEqual({
      instagram: 'https://instagram.com/johndoe',
    })
  })

  it('should normalize TikTok handles', () => {
    expect(normalizeSocialLinks({ tiktok: 'johndoe' })).toEqual({
      tiktok: 'https://tiktok.com/@johndoe',
    })
    expect(normalizeSocialLinks({ tiktok: '@johndoe' })).toEqual({
      tiktok: 'https://tiktok.com/@johndoe',
    })
  })

  it('should normalize YouTube handles', () => {
    expect(normalizeSocialLinks({ youtube: 'johndoe' })).toEqual({
      youtube: 'https://youtube.com/@johndoe',
    })
  })

  it('should normalize Threads handles', () => {
    expect(normalizeSocialLinks({ threads: 'johndoe' })).toEqual({
      threads: 'https://www.threads.net/@johndoe',
    })
  })

  it('should normalize LinkedIn handles', () => {
    expect(normalizeSocialLinks({ linkedin: 'johndoe' })).toEqual({
      linkedin: 'https://www.linkedin.com/in/johndoe',
    })
    expect(normalizeSocialLinks({ linkedin: 'https://www.linkedin.com/in/johndoe' })).toEqual({
      linkedin: 'https://www.linkedin.com/in/johndoe',
    })
  })

  it('should normalize website URLs', () => {
    expect(normalizeSocialLinks({ website: 'example.com' })).toEqual({
      website: 'https://example.com',
    })
    expect(normalizeSocialLinks({ website: 'https://example.com' })).toEqual({
      website: 'https://example.com',
    })
    expect(normalizeSocialLinks({ website: 'http://example.com' })).toEqual({
      website: 'http://example.com',
    })
  })

  it('should drop invalid values', () => {
    expect(normalizeSocialLinks({ twitter: '' })).toEqual({})
    expect(normalizeSocialLinks({ twitter: '   ' })).toEqual({})
    expect(normalizeSocialLinks({ twitter: 'invalid@#$handle' })).toEqual({})
  })

  it('should handle multiple providers', () => {
    expect(
      normalizeSocialLinks({
        twitter: 'johndoe',
        instagram: '@johndoe',
        website: 'example.com',
      })
    ).toEqual({
      twitter: 'https://twitter.com/johndoe',
      instagram: 'https://instagram.com/johndoe',
      website: 'https://example.com',
    })
  })

  it('should only include supported providers', () => {
    const result = normalizeSocialLinks({
      twitter: 'johndoe',
      unsupported: 'value',
    } as any)
    expect(result).toEqual({
      twitter: 'https://twitter.com/johndoe',
    })
    expect('unsupported' in result).toBe(false)
  })
})

