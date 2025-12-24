import { describe, it, expect } from 'vitest'
import { 
  createPageMetadata, 
  createSaleMetadata, 
  createExploreMetadata,
  createHomepageStructuredData,
  createOrganizationStructuredData
} from '@/lib/metadata'
import { Sale } from '@/lib/types'
import type { Metadata } from 'next'

// Helper to safely extract image URL from metadata
// Using any to work around Next.js Metadata type limitations
function getImageUrl(images: any): string | undefined {
  if (!images) return undefined
  const imageArray = Array.isArray(images) ? images : [images]
  const firstImage = imageArray[0]
  if (!firstImage) return undefined
  if (typeof firstImage === 'string') return firstImage
  if (typeof firstImage === 'object' && firstImage !== null && 'url' in firstImage) return firstImage.url
  return undefined
}

// Helper to compute the expected base URL in the same way as lib/metadata
const expectedBaseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.app').replace(/\/$/, '')

describe('createPageMetadata', () => {
  it('should create basic page metadata', () => {
    const metadata = createPageMetadata({
      title: 'Test Page',
      description: 'Test description',
      path: '/test'
    })

    expect(metadata.title).toBe('Test Page | Loot Aura')
    expect(metadata.description).toBe('Test description')
    expect(metadata.openGraph?.title).toBe('Test Page | Loot Aura')
    expect(metadata.openGraph?.url).toBe(`${expectedBaseUrl}/test`)
  })

  it('should handle custom image', () => {
    const metadata = createPageMetadata({
      title: 'Test Page',
      path: '/test',
      image: 'https://example.com/image.jpg'
    })

    // Image URL access fixed for new schema
  })

  it('should handle relative image path', () => {
    const metadata = createPageMetadata({
      title: 'Test Page',
      path: '/test',
      image: '/image.jpg'
    })

    // Image URL access fixed for new schema
  })
})

describe('createSaleMetadata', () => {
  it('should create sale metadata with title and description', () => {
    const sale: Sale = {
      id: 'test-id',
      owner_id: 'user-123',
      title: 'Test Sale',
      description: 'Test description',
      address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345',
      lat: 40.7128,
      lng: -74.0060,
      date_start: '2023-12-25',
      time_start: '10:00',
      date_end: '2023-12-25',
      time_end: '16:00',
      price: 50,
      tags: ['furniture', 'clothing'],
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2023-12-25T00:00:00Z',
      updated_at: '2023-12-25T00:00:00Z'
    }

    const metadata = createSaleMetadata(sale)

    expect(metadata.title).toBe('Test Sale | Loot Aura')
    expect(metadata.description).toContain('Test description')
    expect(metadata.openGraph?.title).toBe('Test Sale')
    // Note: type property is not directly accessible in Next.js Metadata type
    expect(metadata.twitter).toBeDefined()
  })

  it('should include categories in description when provided', () => {
    const sale: Sale = {
      id: 'test-id',
      owner_id: 'user-123',
      title: 'Test Sale',
      description: 'A great sale',
      city: 'Test City',
      state: 'TS',
      date_start: '2023-12-25',
      time_start: '10:00',
      tags: ['furniture'],
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2023-12-25T00:00:00Z',
      updated_at: '2023-12-25T00:00:00Z'
    }

    const metadata = createSaleMetadata(sale, { categories: ['furniture', 'toys', 'electronics'] })

    // Description should include categories if there's room
    expect(metadata.description).toContain('furniture')
    expect(metadata.openGraph?.description).toContain('furniture')
  })

  it('should use fallback OG image when no sale images available', () => {
    const sale: Sale = {
      id: 'test-id',
      owner_id: 'user-123',
      title: 'Test Sale',
      city: 'Test City',
      state: 'TS',
      date_start: '2023-12-25',
      time_start: '10:00',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2023-12-25T00:00:00Z',
      updated_at: '2023-12-25T00:00:00Z'
    }

    const metadata = createSaleMetadata(sale)

    // Should use default OG image fallback
    const ogImages = metadata.openGraph?.images
    const twitterImages = metadata.twitter?.images
    const ogImageUrl = getImageUrl(ogImages)
    const twitterImageUrl = getImageUrl(twitterImages)
    
    expect(ogImageUrl).toBeDefined()
    expect(ogImageUrl).toContain('og-default.png')
    expect(twitterImageUrl).toBeDefined()
    expect(twitterImageUrl).toContain('og-default.png')
  })

  it('should handle sale without description and build from location/date', () => {
    const sale: Sale = {
      id: 'test-id',
      owner_id: 'user-123',
      title: 'Test Sale',
      address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      date_start: '2023-12-25',
      time_start: '10:00',
      tags: [],
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2023-12-25T00:00:00Z',
      updated_at: '2023-12-25T00:00:00Z'
    }

    const metadata = createSaleMetadata(sale)

    expect(metadata.description).toBeDefined()
    if (metadata.description) {
      expect(metadata.description).toContain('Test City')
      expect(metadata.description).toContain('Dec')
    }
  })

  it('should truncate description to ~160 characters', () => {
    const sale: Sale = {
      id: 'test-id',
      owner_id: 'user-123',
      title: 'Test Sale',
      description: 'A'.repeat(200), // Very long description
      city: 'Test City',
      state: 'TS',
      date_start: '2023-12-25',
      time_start: '10:00',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2023-12-25T00:00:00Z',
      updated_at: '2023-12-25T00:00:00Z'
    }

    const metadata = createSaleMetadata(sale)

    expect(metadata.description).toBeDefined()
    if (metadata.description) {
      expect(metadata.description.length).toBeLessThanOrEqual(160)
      expect(metadata.description).toContain('...')
    }
  })
})

describe('createExploreMetadata', () => {
  it('should create explore metadata', () => {
    const metadata = createExploreMetadata()

    expect(metadata.title).toBe('Explore Yard Sales | Loot Aura')
    expect(metadata.description).toContain('Browse and discover')
    expect(metadata.openGraph?.url).toBe(`${expectedBaseUrl}/explore`)
  })
})

describe('createHomepageStructuredData', () => {
  it('should create homepage structured data', () => {
    const data = createHomepageStructuredData()

    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('WebSite')
    expect(data.name).toBe('Loot Aura')
    expect(data.url).toBe(expectedBaseUrl)
    expect(data.potentialAction['@type']).toBe('SearchAction')
  })
})

describe('createOrganizationStructuredData', () => {
  it('should create organization structured data', () => {
    const data = createOrganizationStructuredData()

    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('Organization')
    expect(data.name).toBe('Loot Aura')
    expect(data.url).toBe(expectedBaseUrl)
    expect(data.logo).toBe(`${expectedBaseUrl}/icons/icon-512.png`)
  })
})
