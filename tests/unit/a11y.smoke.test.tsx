/**
 * @vitest-environment jsdom
 * 
 * Accessibility smoke tests
 * 
 * Verifies that key interactive elements have accessible names
 * and that page structure is semantically correct.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SaleDetailClient from '@/app/sales/[id]/SaleDetailClient'
import SellWizardClient from '@/app/sell/new/SellWizardClient'
import type { SaleWithOwnerInfo } from '@/lib/data'
import type { SaleItem } from '@/lib/types'

// Mock Next.js router and hooks
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation')
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
    }),
    useSearchParams: () => ({
      get: vi.fn(() => null),
    }),
  }
})

// Mock Supabase browser client
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
        error: null,
      })),
    },
  })),
}))

// Mock useAuth and related hooks
vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    data: null,
    isLoading: false,
  })),
  useFavorites: vi.fn(() => ({
    data: [],
  })),
  useToggleFavorite: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}))

// Mock useLocationSearch
vi.mock('@/lib/location/useLocation', () => ({
  useLocationSearch: vi.fn(() => ({
    location: null,
  })),
}))

// Mock SimpleMap to avoid mapbox errors
vi.mock('@/components/location/SimpleMap', () => ({
  default: () => <div data-testid="simple-map" role="region" aria-label="Map">Map</div>,
}))

// Mock other components
vi.mock('@/components/sales/SellerActivityCard', () => ({
  SellerActivityCard: () => <div data-testid="seller-activity-card">Seller Activity</div>,
}))

vi.mock('@/components/placeholders/SalePlaceholder', () => ({
  default: () => <div data-testid="sale-placeholder">Placeholder</div>,
}))

vi.mock('@/lib/images/cover', () => ({
  getSaleCoverUrl: vi.fn(() => null),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
}))

// Mock wizard dependencies
vi.mock('@/components/location/AddressAutocomplete', () => ({
  default: () => <div data-testid="address-autocomplete">Address Autocomplete</div>,
}))

vi.mock('@/components/TimePicker30', () => ({
  default: () => <div data-testid="time-picker">Time Picker</div>,
}))

vi.mock('@/components/sales/ItemFormModal', () => ({
  default: () => null, // Modal is conditionally rendered
}))

vi.mock('@/components/sales/ImageUploadCard', () => ({
  default: () => <div data-testid="image-upload">Image Upload</div>,
}))

vi.mock('@/components/upload/ImageThumbnailGrid', () => ({
  default: () => <div data-testid="image-thumbnails">Image Thumbnails</div>,
}))

vi.mock('@/components/sales/ItemCard', () => ({
  default: () => <div data-testid="item-card">Item Card</div>,
}))

vi.mock('@/components/sales/Toast', () => ({
  default: () => null,
}))

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/sales/ConfirmationModal', () => ({
  default: () => null,
}))

// Mock draft functions
vi.mock('@/lib/draft/localDraft', () => ({
  getDraftKey: vi.fn(),
  saveLocalDraft: vi.fn(),
  loadLocalDraft: vi.fn(),
  clearLocalDraft: vi.fn(),
  hasLocalDraft: vi.fn(() => false),
}))

vi.mock('@/lib/draft/draftClient', () => ({
  saveDraftServer: vi.fn(),
  getLatestDraftServer: vi.fn(),
  deleteDraftServer: vi.fn(),
  publishDraftServer: vi.fn(),
}))

// Mock profanity filter
vi.mock('@/lib/filters/profanity', () => ({
  containsUnsavory: vi.fn(() => false),
}))

// Helper to render with QueryClient
const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

describe('Accessibility Smoke Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Sale Detail Page', () => {
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

    it('should render sale title as h1 heading', async () => {
      renderWithQueryClient(<SaleDetailClient sale={mockSale} items={[]} />)

      await waitFor(() => {
        // Both mobile and desktop layouts render h1, so use getAllByRole
        const headings = screen.getAllByRole('heading', { level: 1, name: /Amazing Yard Sale/i })
        expect(headings.length).toBeGreaterThan(0)
      })
    })

    it('should have accessible favorite button', async () => {
      renderWithQueryClient(<SaleDetailClient sale={mockSale} items={[]} />)

      await waitFor(() => {
        // Both mobile and desktop layouts render favorite buttons, so use getAllByRole
        const favoriteButtons = screen.getAllByRole('button', { name: /save|unsave/i })
        expect(favoriteButtons.length).toBeGreaterThan(0)
      })
    })

    it('should have accessible share button', async () => {
      renderWithQueryClient(<SaleDetailClient sale={mockSale} items={[]} />)

      await waitFor(() => {
        // Both mobile and desktop layouts render share buttons, so use getAllByRole
        const shareButtons = screen.getAllByRole('button', { name: /share/i })
        expect(shareButtons.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Sale Wizard', () => {
    it('should have accessible Next button', async () => {
      renderWithQueryClient(
        <SellWizardClient
          initialData={{}}
          userLat={38.25}
          userLng={-85.75}
        />
      )

      await waitFor(() => {
        // Wizard may render multiple instances (mobile/desktop), so use getAllByRole
        const nextButtons = screen.getAllByRole('button', { name: /next/i })
        expect(nextButtons.length).toBeGreaterThan(0)
        // Verify at least one is accessible
        expect(nextButtons[0]).toBeInTheDocument()
      })
    })

    it('should have accessible Previous button', async () => {
      renderWithQueryClient(
        <SellWizardClient
          initialData={{}}
          userLat={38.25}
          userLng={-85.75}
        />
      )

      await waitFor(() => {
        // Wizard may render multiple instances (mobile/desktop), so use getAllByRole
        // Previous button should exist (may be disabled on first step)
        const previousButtons = screen.getAllByRole('button', { name: /previous/i })
        expect(previousButtons.length).toBeGreaterThan(0)
        // Verify at least one is accessible
        expect(previousButtons[0]).toBeInTheDocument()
      })
    })

    it('should render wizard with accessible structure', async () => {
      // Verify wizard renders with accessible navigation buttons
      // Note: Add Item button only appears on step 2 (items step)
      // Full step navigation testing would require more complex setup
      // This smoke test verifies the wizard structure is accessible
      renderWithQueryClient(
        <SellWizardClient
          initialData={{}}
          userLat={38.25}
          userLng={-85.75}
        />
      )

      await waitFor(() => {
        // Verify wizard renders with accessible navigation
        // Wizard may render multiple instances (mobile/desktop), so use getAllByRole
        const nextButtons = screen.getAllByRole('button', { name: /next/i })
        expect(nextButtons.length).toBeGreaterThan(0)
        // Verify at least one is accessible
        expect(nextButtons[0]).toBeInTheDocument()
      })
    })
  })
})

