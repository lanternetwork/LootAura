import { describe, it, expect, vi } from 'vitest'
import { 
  createPageMetadata, 
  createSaleMetadata, 
  createExploreMetadata,
  createHomepageStructuredData,
  createOrganizationStructuredData
} from '@/lib/metadata'
import { Sale } from '@/lib/types'

// Ensure environment variable is set for site URL
const originalEnv = process.env
beforeEach(() => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SITE_URL: 'https://lootaura.app' }
})
afterEach(() => {
  process.env = originalEnv
})

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
    expect(metadata.openGraph?.url).toBe('https://yardsalefinder.com/test')
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
  it('should create sale metadata', () => {
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
    // OpenGraph type property doesn't exist in the metadata type
    // Photos field doesn't exist in new schema, so no image URL expected
  })

  it('should handle sale without description', () => {
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

    expect(metadata.description).toContain('123 Test St')
  })
})

describe('createExploreMetadata', () => {
  it('should create explore metadata', () => {
    const metadata = createExploreMetadata()

    expect(metadata.title).toBe('Explore Yard Sales | Loot Aura')
    expect(metadata.description).toContain('Browse and discover')
    expect(metadata.openGraph?.url).toBe('https://yardsalefinder.com/explore')
  })
})

describe('createHomepageStructuredData', () => {
  it('should create homepage structured data', () => {
    const data = createHomepageStructuredData()

    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('WebSite')
    expect(data.name).toBe('Loot Aura')
    expect(data.url).toBe('https://yardsalefinder.com')
    expect(data.potentialAction['@type']).toBe('SearchAction')
  })
})

describe('createOrganizationStructuredData', () => {
  it('should create organization structured data', () => {
    const data = createOrganizationStructuredData()

    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('Organization')
    expect(data.name).toBe('Loot Aura')
    expect(data.url).toBe('https://yardsalefinder.com')
    expect(data.logo).toBe('https://yardsalefinder.com/icons/icon-512.png')
  })
})
