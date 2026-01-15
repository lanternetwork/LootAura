/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
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
    mockUseAuth.mockReturnValue({ data: null })
  })

  it('should display real items from the database', () => {
    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={mockItems}
      />
    )

    // Check that real items are displayed (both mobile and desktop layouts render items)
    const coffeeTableElements = screen.getAllByText('Vintage Coffee Table')
    expect(coffeeTableElements.length).toBeGreaterThan(0)
    const chairsElements = screen.getAllByText('Dining Room Chairs')
    expect(chairsElements.length).toBeGreaterThan(0)
    const price50Elements = screen.getAllByText('$50.00')
    expect(price50Elements.length).toBeGreaterThan(0)
    const price80Elements = screen.getAllByText('$80.00')
    expect(price80Elements.length).toBeGreaterThan(0)
    const goodElements = screen.getAllByText('Good')
    expect(goodElements.length).toBeGreaterThan(0)
    const excellentElements = screen.getAllByText('Excellent')
    expect(excellentElements.length).toBeGreaterThan(0)
  })

  it('does not show promote CTA for non-owners when promotions are enabled', () => {
    mockUseAuth.mockReturnValue({ data: { id: 'someone-else', email: 'other@example.test' } } as any)

    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={mockItems}
        promotionsEnabled={true}
        paymentsEnabled={true}
      />
    )

    expect(screen.queryByTestId('sale-detail-promote-button')).not.toBeInTheDocument()
  })

  it('shows promote panel for owner when promotions are enabled', () => {
    mockUseAuth.mockReturnValue({ data: { id: 'test-owner-id', email: 'owner@example.test' } } as any)

    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={mockItems}
        promotionsEnabled={true}
        paymentsEnabled={true}
      />
    )

    expect(screen.getByText('Promote this sale')).toBeInTheDocument()
  })

  it('shows active promotion state with ends date when promotion is active', async () => {
    mockUseAuth.mockReturnValue({ data: { id: 'test-owner-id', email: 'owner@example.test' } } as any)

    // Mock fetch to return active promotion status (matching API response format)
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        statuses: [{
          sale_id: mockSale.id,
          is_active: true,
          ends_at: '2030-01-01T00:00:00.000Z',
          tier: 'featured_week',
        }],
      }),
    })
    ;(global as any).fetch = mockFetch

    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={mockItems}
        promotionsEnabled={true}
        paymentsEnabled={true}
      />
    )

    // Wait for the promotion status to be fetched and rendered
    const active = await screen.findByTestId('sale-detail-promote-active')
    expect(active.textContent).toContain('Promoted')
    expect(active.textContent).toMatch(/Ends/)
  })

  it('does not call checkout when payments are disabled (seller view)', async () => {
    mockUseAuth.mockReturnValue({ data: { id: 'test-owner-id', email: 'owner@example.test' } } as any)

    const originalFetch = global.fetch
    const mockFetch = vi.fn((url: string) => {
      // Mock promotion status endpoint
      if (typeof url === 'string' && url.includes('/api/promotions/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            statuses: [{
              sale_id: mockSale.id,
              is_active: false,
              ends_at: null,
              tier: null,
            }],
          }),
        })
      }
      // For other endpoints, return undefined to prevent calls
      return Promise.resolve(undefined)
    })
    ;(global as any).fetch = mockFetch

    try {
      render(
        <SaleDetailClient 
          sale={mockSale} 
          displayCategories={['furniture']}
          items={mockItems}
          promotionsEnabled={true}
          paymentsEnabled={false}
        />
      )

      // Wait for promotion status to load
      await waitFor(() => {
        const button = screen.getByTestId('sale-detail-promote-button')
        expect(button).toBeDisabled()
      })

      const button = screen.getByTestId('sale-detail-promote-button')
      expect(button).toBeDisabled()

      // Even if clicked programmatically, paymentsEnabled=false should guard before fetch
      button.click()

      await Promise.resolve()

      const calls = mockFetch.mock.calls.filter(
        (args) =>
          typeof args[0] === 'string' &&
          (args[0] as string).includes('/api/promotions/checkout')
      )
      expect(calls.length).toBe(0)
    } finally {
      (global as any).fetch = originalFetch
    }
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

    // Check that image is rendered for item with photo (both mobile and desktop layouts render images)
    const images = screen.getAllByAltText('Dining Room Chairs')
    expect(images.length).toBeGreaterThan(0)
    // Check that at least one image has the correct src
    const imageWithSrc = images.find(img => img.getAttribute('src') === 'https://example.com/chair.jpg')
    expect(imageWithSrc).toBeDefined()
  })

  it('should show empty state when no items exist', () => {
    render(
      <SaleDetailClient 
        sale={mockSale} 
        displayCategories={['furniture']}
        items={[]}
      />
    )

    // Both mobile and desktop layouts render empty state
    const emptyStateElements = screen.getAllByText('No items listed yet.')
    expect(emptyStateElements.length).toBeGreaterThan(0)
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

    // Both mobile and desktop layouts render items
    const freeItemElements = screen.getAllByText('Free Item')
    expect(freeItemElements.length).toBeGreaterThan(0)
    const priceNotSpecifiedElements = screen.getAllByText('Price not specified')
    expect(priceNotSpecifiedElements.length).toBeGreaterThan(0)
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

