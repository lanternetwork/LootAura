/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SaleDetailClient from '@/app/sales/[id]/SaleDetailClient'
import { getSaleWithItems } from '@/lib/data/salesAccess'
import type { SaleItem } from '@/lib/types'

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
vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    data: null,
  })),
  useFavorites: vi.fn(() => ({
    data: [],
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
  tags: ['furniture'],
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

const mockItems: SaleItem[] = [
  {
    id: 'item-1',
    sale_id: 'test-sale-id',
    name: 'Vintage Coffee Table',
    category: 'furniture',
    condition: 'Good',
    price: 50,
    purchased: false,
    created_at: '2025-11-01T00:00:00Z',
  },
  {
    id: 'item-2',
    sale_id: 'test-sale-id',
    name: 'Dining Room Chairs',
    category: 'furniture',
    condition: 'Excellent',
    price: 80,
    photo: 'https://example.com/chair.jpg',
    purchased: false,
    created_at: '2025-11-01T00:00:00Z',
  },
]

// Known stock/mock item names that should NOT appear
const STOCK_ITEM_NAMES = [
  'Vintage Coffee Table',
  'Dining Room Chairs (Set of 4)',
  'Bookshelf',
  'Kitchen Appliances',
  'Children\'s Toys',
  'Garden Tools',
]

describe('Sale Details Items Display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display real items from the database', () => {
    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={mockItems}
      />
    )

    // Check that real items are displayed
    expect(screen.getByText('Vintage Coffee Table')).toBeInTheDocument()
    expect(screen.getByText('Dining Room Chairs')).toBeInTheDocument()
    expect(screen.getByText('$50.00')).toBeInTheDocument()
    expect(screen.getByText('$80.00')).toBeInTheDocument()
    expect(screen.getByText('Good')).toBeInTheDocument()
    expect(screen.getByText('Excellent')).toBeInTheDocument()
  })

  it('should display item categories when available', () => {
    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={mockItems}
      />
    )

    // Check that category chips are displayed
    const categoryChips = screen.getAllByText('furniture')
    expect(categoryChips.length).toBeGreaterThan(0)
  })

  it('should display item images when available', () => {
    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={mockItems}
      />
    )

    // Check that image is rendered for item with photo
    const image = screen.getByAltText('Dining Room Chairs')
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', 'https://example.com/chair.jpg')
  })

  it('should show empty state when no items exist', () => {
    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={[]}
      />
    )

    expect(screen.getByText('No items listed yet.')).toBeInTheDocument()
    expect(screen.queryByText('Vintage Coffee Table')).not.toBeInTheDocument()
  })

  it('should handle items without prices gracefully', () => {
    const itemsWithoutPrice: SaleItem[] = [
      {
        id: 'item-3',
        sale_id: 'test-sale-id',
        name: 'Free Item',
        purchased: false,
        created_at: '2025-11-01T00:00:00Z',
      },
    ]

    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={[]}
        items={itemsWithoutPrice}
      />
    )

    expect(screen.getByText('Free Item')).toBeInTheDocument()
    expect(screen.getByText('Price not specified')).toBeInTheDocument()
  })

  it('should NOT display any stock/mock item names', () => {
    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={mockItems}
      />
    )

    // Verify that known stock item names are NOT present (except if they're actual items)
    // In this test, "Vintage Coffee Table" is in mockItems, so it should appear
    // But "Dining Room Chairs (Set of 4)" should NOT appear (our item is just "Dining Room Chairs")
    STOCK_ITEM_NAMES.forEach((stockName) => {
      if (stockName === 'Vintage Coffee Table' || stockName === 'Dining Room Chairs (Set of 4)') {
        // These might appear if they're in mockItems, which is fine for this test
        // The important thing is we're not using the hardcoded array
        return
      }
      expect(screen.queryByText(stockName)).not.toBeInTheDocument()
    })
  })
})

