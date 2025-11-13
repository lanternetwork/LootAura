/**
 * Accessibility smoke tests
 * 
 * Verifies that key interactive elements have accessible names
 * and that page structure is semantically correct.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SaleDetailClient from '@/app/sales/[id]/SaleDetailClient'
import SellWizardClient from '@/app/sell/new/SellWizardClient'
import type { SaleWithOwnerInfo } from '@/lib/data'
import type { SaleItem } from '@/lib/types'

// Mock Next.js router and hooks
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
}))

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => ({
    data: null,
    isLoading: false,
  }),
  useFavorites: () => ({
    data: [],
  }),
  useToggleFavorite: () => ({
    mutateAsync: vi.fn(),
  }),
}))

vi.mock('@/lib/location/useLocation', () => ({
  useLocationSearch: () => ({
    location: null,
  }),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
}))

describe('Accessibility Smoke Tests', () => {
  describe('Sale Detail Page', () => {
    it('should render sale title as h1 heading', () => {
      const mockSale: SaleWithOwnerInfo = {
        id: 'test-sale',
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

      render(<SaleDetailClient sale={mockSale} items={[]} />)

      const heading = screen.getByRole('heading', { level: 1, name: /Amazing Yard Sale/i })
      expect(heading).toBeDefined()
    })

    it('should have accessible favorite button', () => {
      const mockSale: SaleWithOwnerInfo = {
        id: 'test-sale',
        owner_id: 'owner-123',
        title: 'Test Sale',
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

      render(<SaleDetailClient sale={mockSale} items={[]} />)

      // Should have accessible name (either visible text or aria-label)
      const favoriteButton = screen.getByRole('button', { name: /save|unsave/i })
      expect(favoriteButton).toBeDefined()
    })

    it('should have accessible share button', () => {
      const mockSale: SaleWithOwnerInfo = {
        id: 'test-sale',
        owner_id: 'owner-123',
        title: 'Test Sale',
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

      render(<SaleDetailClient sale={mockSale} items={[]} />)

      const shareButton = screen.getByRole('button', { name: /share/i })
      expect(shareButton).toBeDefined()
    })
  })

  describe('Sale Wizard', () => {
    it('should have accessible Next button', () => {
      render(
        <SellWizardClient
          initialData={{}}
          userLat={38.25}
          userLng={-85.75}
        />
      )

      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).toBeDefined()
    })

    it('should have accessible Previous button', () => {
      render(
        <SellWizardClient
          initialData={{}}
          userLat={38.25}
          userLng={-85.75}
        />
      )

      // Previous button should exist (may be disabled on first step)
      const previousButton = screen.getByRole('button', { name: /previous/i })
      expect(previousButton).toBeDefined()
    })

    it('should have accessible Add Item button', () => {
      render(
        <SellWizardClient
          initialData={{}}
          userLat={38.25}
          userLng={-85.75}
        />
      )

      // Navigate to items step (step 2)
      const nextButton = screen.getByRole('button', { name: /next/i })
      nextButton.click()
      nextButton.click() // Go to items step

      const addItemButton = screen.getByRole('button', { name: /add item/i })
      expect(addItemButton).toBeDefined()
    })
  })
})

