import { describe, it, expect, beforeEach } from 'vitest'
import { getSaleCoverUrl, CoverUrl } from '@/lib/images/cover'

describe('getSaleCoverUrl', () => {
  const mockSale = {
    title: 'Test Sale',
    address: '123 Test St',
    cover_image_url: null,
    images: null
  }

  it('should return cover_image_url when present', () => {
    const sale = {
      ...mockSale,
      cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg'
    }

    const result = getSaleCoverUrl(sale)
    
    expect(result).toEqual({
      url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg',
      alt: 'Test Sale cover'
    })
  })

  it('should return first image when cover_image_url is null but images exist', () => {
    const sale = {
      ...mockSale,
      cover_image_url: null,
      images: [
        'https://res.cloudinary.com/test/image/upload/v123/image1.jpg',
        'https://res.cloudinary.com/test/image/upload/v123/image2.jpg'
      ]
    }

    const result = getSaleCoverUrl(sale)
    
    expect(result).toEqual({
      url: 'https://res.cloudinary.com/test/image/upload/v123/image1.jpg',
      alt: 'Test Sale photo'
    })
  })

  it('should return null when no images are available', () => {
    const sale = {
      ...mockSale,
      cover_image_url: null,
      images: null
    }

    const result = getSaleCoverUrl(sale)
    
    expect(result).toBeNull()
  })

  it('should return null when images array is empty', () => {
    const sale = {
      ...mockSale,
      cover_image_url: null,
      images: []
    }

    const result = getSaleCoverUrl(sale)
    
    expect(result).toBeNull()
  })

  it('should handle sale without title gracefully', () => {
    const sale = {
      title: undefined,
      cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg'
    }

    const result = getSaleCoverUrl(sale)
    
    expect(result).toEqual({
      url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg',
      alt: 'Sale cover'
    })
  })

  it('should prioritize cover_image_url over first image', () => {
    const sale = {
      ...mockSale,
      cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg',
      images: [
        'https://res.cloudinary.com/test/image/upload/v123/image1.jpg',
        'https://res.cloudinary.com/test/image/upload/v123/image2.jpg'
      ]
    }

    const result = getSaleCoverUrl(sale)
    
    expect(result).toEqual({
      url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg',
      alt: 'Test Sale cover'
    })
  })
})
