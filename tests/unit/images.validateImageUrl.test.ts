import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isAllowedImageUrl, getCloudinaryCloudName } from '@/lib/images/validateImageUrl'

describe('validateImageUrl', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('getCloudinaryCloudName', () => {
    it('should return cloud name from env', () => {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'test-cloud'
      expect(getCloudinaryCloudName()).toBe('test-cloud')
    })

    it('should return undefined when env not set', () => {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      expect(getCloudinaryCloudName()).toBeUndefined()
    })
  })

  describe('isAllowedImageUrl', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'test-cloud'
    })

    it('should accept valid Cloudinary URLs', () => {
      const validUrls = [
        'https://res.cloudinary.com/test-cloud/image/upload/v1234567890/sample.jpg',
        'https://res.cloudinary.com/test-cloud/image/upload/w_100,h_100,c_fill/sample.jpg',
        'https://res.cloudinary.com/test-cloud/image/upload/f_auto,q_auto/sample.jpg',
        'https://res.cloudinary.com/test-cloud/image/upload/sample.jpg'
      ]

      validUrls.forEach(url => {
        expect(isAllowedImageUrl(url)).toBe(true)
      })
    })

    it('should reject non-HTTPS URLs', () => {
      const invalidUrls = [
        'http://res.cloudinary.com/test-cloud/image/upload/sample.jpg',
        'ftp://res.cloudinary.com/test-cloud/image/upload/sample.jpg'
      ]

      invalidUrls.forEach(url => {
        expect(isAllowedImageUrl(url)).toBe(false)
      })
    })

    it('should reject wrong hostname', () => {
      const invalidUrls = [
        'https://example.com/test-cloud/image/upload/sample.jpg',
        'https://cloudinary.com/test-cloud/image/upload/sample.jpg',
        'https://res.example.com/test-cloud/image/upload/sample.jpg'
      ]

      invalidUrls.forEach(url => {
        expect(isAllowedImageUrl(url)).toBe(false)
      })
    })

    it('should reject wrong cloud name', () => {
      const invalidUrls = [
        'https://res.cloudinary.com/wrong-cloud/image/upload/sample.jpg',
        'https://res.cloudinary.com/other-cloud/image/upload/sample.jpg'
      ]

      invalidUrls.forEach(url => {
        expect(isAllowedImageUrl(url)).toBe(false)
      })
    })

    it('should reject non-upload paths', () => {
      const invalidUrls = [
        'https://res.cloudinary.com/test-cloud/image/fetch/sample.jpg',
        'https://res.cloudinary.com/test-cloud/video/upload/sample.mp4',
        'https://res.cloudinary.com/test-cloud/raw/upload/sample.txt'
      ]

      invalidUrls.forEach(url => {
        expect(isAllowedImageUrl(url)).toBe(false)
      })
    })

    it('should reject malformed URLs', () => {
      const invalidUrls = [
        'not-a-url',
        '',
        'https://',
        'https://res.cloudinary.com',
        'https://res.cloudinary.com/test-cloud',
        'https://res.cloudinary.com/test-cloud/image',
        'https://res.cloudinary.com/test-cloud/image/upload'
      ]

      invalidUrls.forEach(url => {
        expect(isAllowedImageUrl(url)).toBe(false)
      })
    })

    it('should return false when cloud name not configured', () => {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      
      const url = 'https://res.cloudinary.com/test-cloud/image/upload/sample.jpg'
      expect(isAllowedImageUrl(url)).toBe(false)
    })

    it('should handle empty or null input', () => {
      expect(isAllowedImageUrl('')).toBe(false)
      expect(isAllowedImageUrl(null as any)).toBe(false)
      expect(isAllowedImageUrl(undefined as any)).toBe(false)
    })
  })
})
