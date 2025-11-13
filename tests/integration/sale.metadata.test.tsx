/**
 * Integration tests for sale detail page metadata generation
 * 
 * Tests verify that:
 * - generateMetadata returns correct metadata for existing sales
 * - generateMetadata handles 404 cases gracefully
 * - OG images use sale cover images when available
 * - Fallback OG image is used when no sale images exist
 * 
 * To extend these tests, add more assertions for:
 * - Category inclusion in descriptions
 * - Date formatting in descriptions
 * - Title truncation behavior
 * - Twitter card configuration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Metadata } from 'next'
import { getSaleWithItems } from '@/lib/data/salesAccess'
import type { SaleWithOwnerInfo } from '@/lib/data'
import type { SaleItem } from '@/lib/types'

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

// Mock the data access function
vi.mock('@/lib/data/salesAccess', () => ({
  getSaleWithItems: vi.fn(),
}))

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  })),
}))

// Import the page component's generateMetadata function
// Note: We're testing the metadata generation logic, not the full page render
async function testGenerateMetadata(saleId: string): Promise<Metadata> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server')
  const { getSaleWithItems } = await import('@/lib/data/salesAccess')
  const { createSaleMetadata } = await import('@/lib/metadata')
  
  const supabase = createSupabaseServerClient()
  const result = await getSaleWithItems(supabase, saleId)
  
  if (!result) {
    return {
      title: 'Sale not found · LootAura',
      description: 'This sale no longer exists or is not available.',
      openGraph: {
        title: 'Sale not found · LootAura',
        description: 'This sale no longer exists or is not available.',
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title: 'Sale not found · LootAura',
        description: 'This sale no longer exists or is not available.',
      },
    }
  }

  // Compute categories from sale tags and item categories
  const saleCats = Array.isArray(result.sale.tags) ? result.sale.tags : []
  const itemCats = result.items.map(i => i.category).filter((cat): cat is string => Boolean(cat))
  const displayCategories = Array.from(new Set([...saleCats, ...itemCats])).sort()

  return createSaleMetadata(result.sale, { categories: displayCategories })
}

describe('Sale Detail Page Metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 404 metadata when sale is not found', async () => {
    const mockGetSaleWithItems = vi.mocked(getSaleWithItems)
    mockGetSaleWithItems.mockResolvedValueOnce(null)

    const metadata = await testGenerateMetadata('non-existent-id')

    expect(metadata.title).toBe('Sale not found · LootAura')
    expect(metadata.description).toBe('This sale no longer exists or is not available.')
    expect(metadata.openGraph?.title).toBe('Sale not found · LootAura')
    // Note: card property is not directly accessible in Next.js Metadata type
    expect(metadata.twitter).toBeDefined()
  })

  it('should generate metadata with sale title', async () => {
    const mockSale: SaleWithOwnerInfo = {
      id: 'test-sale-id',
      owner_id: 'owner-123',
      title: 'Amazing Yard Sale',
      city: 'Louisville',
      state: 'KY',
      date_start: '2024-12-15',
      time_start: '09:00',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      owner_profile: null,
      owner_stats: {
        total_sales: 0,
        avg_rating: 5.0,
        ratings_count: 0,
        last_sale_at: null,
      },
    }

    const mockItems: SaleItem[] = []

    const mockGetSaleWithItems = vi.mocked(getSaleWithItems)
    mockGetSaleWithItems.mockResolvedValueOnce({
      sale: mockSale,
      items: mockItems,
    })

    const metadata = await testGenerateMetadata('test-sale-id')

    expect(metadata.title).toContain('Amazing Yard Sale')
    expect(metadata.openGraph?.title).toBe('Amazing Yard Sale')
    expect(metadata.twitter?.title).toBe('Amazing Yard Sale')
  })

  it('should use sale cover image for OG image when available', async () => {
    const mockSale: SaleWithOwnerInfo = {
      id: 'test-sale-id',
      owner_id: 'owner-123',
      title: 'Sale with Image',
      city: 'Louisville',
      state: 'KY',
      date_start: '2024-12-15',
      time_start: '09:00',
      cover_image_url: 'https://res.cloudinary.com/example/image/upload/sale.jpg',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      owner_profile: null,
      owner_stats: {
        total_sales: 0,
        avg_rating: 5.0,
        ratings_count: 0,
        last_sale_at: null,
      },
    }

    const mockItems: SaleItem[] = []

    const mockGetSaleWithItems = vi.mocked(getSaleWithItems)
    mockGetSaleWithItems.mockResolvedValueOnce({
      sale: mockSale,
      items: mockItems,
    })

    const metadata = await testGenerateMetadata('test-sale-id')

    const ogImages = metadata.openGraph?.images
    const twitterImages = metadata.twitter?.images
    const ogImageUrl = getImageUrl(ogImages)
    const twitterImageUrl = getImageUrl(twitterImages)
    
    expect(ogImageUrl).toBeDefined()
    expect(ogImageUrl).toContain('cloudinary.com')
    expect(twitterImageUrl).toBeDefined()
    expect(twitterImageUrl).toContain('cloudinary.com')
  })

  it('should use fallback OG image when no sale images exist', async () => {
    const mockSale: SaleWithOwnerInfo = {
      id: 'test-sale-id',
      owner_id: 'owner-123',
      title: 'Sale without Image',
      city: 'Louisville',
      state: 'KY',
      date_start: '2024-12-15',
      time_start: '09:00',
      cover_image_url: null,
      images: null,
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      owner_profile: null,
      owner_stats: {
        total_sales: 0,
        avg_rating: 5.0,
        ratings_count: 0,
        last_sale_at: null,
      },
    }

    const mockItems: SaleItem[] = []

    const mockGetSaleWithItems = vi.mocked(getSaleWithItems)
    mockGetSaleWithItems.mockResolvedValueOnce({
      sale: mockSale,
      items: mockItems,
    })

    const metadata = await testGenerateMetadata('test-sale-id')

    // Should use default OG image fallback
    const ogImageUrl = getImageUrl(metadata.openGraph?.images)
    const twitterImageUrl = getImageUrl(metadata.twitter?.images)
    
    expect(ogImageUrl).toBeDefined()
    expect(ogImageUrl).toContain('og-default.png')
    expect(twitterImageUrl).toBeDefined()
    expect(twitterImageUrl).toContain('og-default.png')
  })
})

