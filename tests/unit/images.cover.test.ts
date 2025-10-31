import { describe, it, expect } from 'vitest'
import { getSaleCoverUrl } from '@/lib/images/cover'

describe('getSaleCoverUrl', () => {
  it('picks cover_image_url when present', () => {
    const sale = { title: 'Test', cover_image_url: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg', images: ['https://res.cloudinary.com/demo/image/upload/v1/b.jpg'] }
    const cover = getSaleCoverUrl(sale)
    expect(cover?.url).toBe(sale.cover_image_url)
    expect(cover?.alt).toContain('Test')
  })

  it('falls back to first image', () => {
    const sale = { title: 'Test', images: ['https://res.cloudinary.com/demo/image/upload/v1/b.jpg', 'x'] }
    const cover = getSaleCoverUrl(sale)
    expect(cover?.url).toBe(sale.images?.[0])
  })

  it('returns null when no images', () => {
    const sale = { title: 'No Photo' }
    const cover = getSaleCoverUrl(sale)
    expect(cover).toBeNull()
  })
})

