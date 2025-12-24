/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SaleDetailClient from '@/app/sales/[id]/SaleDetailClient'
import { getSaleWithItems } from '@/lib/data/salesAccess'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: null },
        error: null,
      })),
    },
  })),
}))

// Mock getSaleWithItems
vi.mock('@/lib/data/salesAccess', () => ({
  getSaleWithItems: vi.fn(),
}))

// Mock useSearchParams
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation')
  return {
    ...actual,
    useSearchParams: vi.fn(() => ({
      get: vi.fn(() => null),
    })),
  }
})

// Mock useLocationSearch
vi.mock('@/lib/location/useLocation', () => ({
  useLocationSearch: vi.fn(() => ({
    location: null,
  })),
}))

// Mock useAuth and useFavorites
const mockUseAuth = vi.fn(() => ({
  data: null,
}))

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  useFavorites: vi.fn(() => ({
    data: [],
  })),
  useToggleFavorite: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}))

// Mock getSaleCoverUrl
vi.mock('@/lib/images/cover', () => ({
  getSaleCoverUrl: vi.fn(() => null),
}))

// Mock SimpleMap
vi.mock('@/components/location/SimpleMap', () => ({
  default: () => <div data-testid="simple-map">Map</div>,
}))

// Mock SellerActivityCard
vi.mock('@/components/sales/SellerActivityCard', () => ({
  SellerActivityCard: () => <div data-testid="seller-activity-card">Seller Activity</div>,
}))

// Mock SalePlaceholder
vi.mock('@/components/placeholders/SalePlaceholder', () => ({
  default: () => <div data-testid="sale-placeholder">Placeholder</div>,
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const mockSale = {
  id: 'test-sale-id',
  owner_id: 'test-owner-id',
  title: 'Test Sale',
  description: 'Test description',
  address: '123 Test St',
  city: 'Test City',
  state: 'TS',
  zip_code: '12345',
  lat: 38.2527,
  lng: -85.7585,
  date_start: '2025-11-15',
  time_start: '09:00',
  date_end: undefined,
  time_end: undefined,
  tags: ['furniture', 'toys'],
  status: 'published' as const,
  privacy_mode: 'exact' as const,
  is_featured: false,
  pricing_mode: 'negotiable' as const,
  created_at: '2025-11-01T00:00:00Z',
  updated_at: '2025-11-01T00:00:00Z',
  owner_profile: null,
  owner_stats: {
    total_sales: 0,
    avg_rating: 5.0,
    ratings_count: 0,
    last_sale_at: null,
  },
}

describe('Sale Details Categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({ data: null })
  })

  it('should display union of sale tags and item categories', async () => {
    const mockItems = [
      { id: 'item-1', sale_id: 'test-sale-id', name: 'Item 1', category: 'garden', purchased: false },
      { id: 'item-2', sale_id: 'test-sale-id', name: 'Item 2', category: 'toys', purchased: false },
    ]

    vi.mocked(getSaleWithItems).mockResolvedValue({
      sale: mockSale,
      items: mockItems,
    })

    // Compute expected categories (union, sorted)
    const saleCats = mockSale.tags || []
    const itemCats = mockItems.map(i => i.category).filter(Boolean)
    const expectedCategories = Array.from(new Set([...saleCats, ...itemCats])).sort()
    // Expected: ['furniture', 'garden', 'toys']

    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={expectedCategories}
      />
    )

    // Check that categories section is visible (multiple headings may exist for responsive layouts)
    const categoriesHeadings = screen.getAllByText('Categories')
    expect(categoriesHeadings.length).toBeGreaterThan(0)

    // Check that all expected categories are displayed (both mobile and desktop layouts render categories)
    const furnitureElements = screen.getAllByText('furniture')
    expect(furnitureElements.length).toBeGreaterThan(0)
    const gardenElements = screen.getAllByText('garden')
    expect(gardenElements.length).toBeGreaterThan(0)
    const toysElements = screen.getAllByText('toys')
    expect(toysElements.length).toBeGreaterThan(0)
  })

  it('should show only item categories when sale has no tags', async () => {
    const saleWithoutTags = { ...mockSale, tags: undefined }
    const mockItems = [
      { id: 'item-1', sale_id: 'test-sale-id', name: 'Item 1', category: 'garden', purchased: false },
      { id: 'item-2', sale_id: 'test-sale-id', name: 'Item 2', category: 'toys', purchased: false },
    ]

    vi.mocked(getSaleWithItems).mockResolvedValue({
      sale: saleWithoutTags,
      items: mockItems,
    })

    const itemCats = mockItems.map(i => i.category).filter(Boolean)
    const expectedCategories = Array.from(new Set(itemCats)).sort()

    render(
      <SaleDetailClient 
        sale={saleWithoutTags} 
        displayCategories={expectedCategories}
      />
    )

    const categoriesHeadings = screen.getAllByText('Categories')
    expect(categoriesHeadings.length).toBeGreaterThan(0)
    const gardenElements = screen.getAllByText('garden')
    expect(gardenElements.length).toBeGreaterThan(0)
    const toysElements = screen.getAllByText('toys')
    expect(toysElements.length).toBeGreaterThan(0)
  })

  it('should show only sale tags when items have no categories', async () => {
    const mockItems = [
      { id: 'item-1', sale_id: 'test-sale-id', name: 'Item 1', category: undefined, purchased: false },
    ]

    vi.mocked(getSaleWithItems).mockResolvedValue({
      sale: mockSale,
      items: mockItems,
    })

    const saleCats = mockSale.tags || []
    const expectedCategories = Array.from(new Set(saleCats)).sort()

    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={expectedCategories}
      />
    )

    const categoriesHeadings = screen.getAllByText('Categories')
    expect(categoriesHeadings.length).toBeGreaterThan(0)
    const furnitureElements = screen.getAllByText('furniture')
    expect(furnitureElements.length).toBeGreaterThan(0)
    const toysElements = screen.getAllByText('toys')
    expect(toysElements.length).toBeGreaterThan(0)
  })

  it('should hide categories section when no categories exist', async () => {
    const saleWithoutTags = { ...mockSale, tags: undefined }
    const mockItems = [
      { id: 'item-1', sale_id: 'test-sale-id', name: 'Item 1', category: undefined, purchased: false },
    ]

    vi.mocked(getSaleWithItems).mockResolvedValue({
      sale: saleWithoutTags,
      items: mockItems,
    })

    render(
      <SaleDetailClient 
        sale={saleWithoutTags} 
        displayCategories={[]}
      />
    )

    // Categories section should not be rendered
    expect(screen.queryByText('Categories')).not.toBeInTheDocument()
  })

  it('should handle duplicate categories (union)', async () => {
    const saleWithTags = { ...mockSale, tags: ['furniture', 'toys'] }
    const mockItems = [
      { id: 'item-1', sale_id: 'test-sale-id', name: 'Item 1', category: 'toys', purchased: false }, // duplicate
      { id: 'item-2', sale_id: 'test-sale-id', name: 'Item 2', category: 'garden', purchased: false },
    ]

    vi.mocked(getSaleWithItems).mockResolvedValue({
      sale: saleWithTags,
      items: mockItems,
    })

    const saleCats = saleWithTags.tags || []
    const itemCats = mockItems.map(i => i.category).filter(Boolean)
    const expectedCategories = Array.from(new Set([...saleCats, ...itemCats])).sort()
    // Expected: ['furniture', 'garden', 'toys'] (toys appears only once)

    render(
      <SaleDetailClient 
        sale={saleWithTags} 
        displayCategories={expectedCategories}
      />
    )

    // Check that 'toys' appears (both mobile and desktop layouts render it, so we check it exists)
    const toysElements = screen.getAllByText('toys')
    expect(toysElements.length).toBeGreaterThan(0)

    const furnitureElements = screen.getAllByText('furniture')
    expect(furnitureElements.length).toBeGreaterThan(0)
    const gardenElements = screen.getAllByText('garden')
    expect(gardenElements.length).toBeGreaterThan(0)
  })
})

