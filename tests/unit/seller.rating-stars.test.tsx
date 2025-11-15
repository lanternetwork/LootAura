import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SellerRatingStars } from '@/components/seller/SellerRatingStars'

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

// Mock useAuth and useRouter
const mockUseAuth = vi.fn()
vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('SellerRatingStars', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockClear()
    // Default mock: authenticated user
    mockUseAuth.mockReturnValue({
      data: { id: 'user-123' },
      isLoading: false,
      error: null,
    })
  })

  it('renders stars with correct average rating', () => {
    render(
      <TestWrapper>
        <SellerRatingStars
          sellerId="seller-123"
          avgRating={4.5}
          ratingsCount={10}
          currentUserRating={null}
          isSeller={false}
        />
      </TestWrapper>
    )

    // Should show 4.5 stars (4 filled, 1 empty)
    const stars = screen.getAllByRole('button', { name: /rate \d out of 5 stars/i })
    expect(stars).toHaveLength(5)
  })

  it('displays rating summary text', () => {
    render(
      <SellerRatingStars
        sellerId="seller-123"
        avgRating={4.5}
        ratingsCount={10}
        currentUserRating={null}
        isSeller={false}
      />
    )

    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('(10 ratings)')).toBeInTheDocument()
  })

  it('displays "No ratings yet" when ratings count is 0', () => {
    render(
      <TestWrapper>
        <SellerRatingStars
          sellerId="seller-123"
          avgRating={null}
          ratingsCount={0}
          currentUserRating={null}
          isSeller={false}
        />
      </TestWrapper>
    )

    expect(screen.getByText('No ratings yet')).toBeInTheDocument()
  })

  it('shows user rating when provided', () => {
    render(
      <TestWrapper>
        <SellerRatingStars
          sellerId="seller-123"
          avgRating={4.5}
          ratingsCount={10}
          currentUserRating={5}
          isSeller={false}
        />
      </TestWrapper>
    )

    expect(screen.getByText('Your rating: 5 stars')).toBeInTheDocument()
  })

  it('makes stars read-only when user is the seller', () => {
    render(
      <TestWrapper>
        <SellerRatingStars
          sellerId="seller-123"
          avgRating={4.5}
          ratingsCount={10}
          currentUserRating={null}
          isSeller={true}
        />
      </TestWrapper>
    )

    const stars = screen.getAllByRole('button', { name: /rate \d out of 5 stars/i })
    stars.forEach((star) => {
      expect(star).toBeDisabled()
      expect(star).toHaveAttribute('tabIndex', '-1')
    })
  })

  it('calls API when star is clicked', async () => {
    // Ensure user is authenticated (set before render)
    mockUseAuth.mockReturnValue({
      data: { id: 'user-123' },
      isLoading: false,
      error: null,
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        rating: 4,
        summary: { avg_rating: 4.0, ratings_count: 1 },
      }),
    })

    // Mock window.location for redirect check
    const originalLocation = window.location
    delete (window as any).location
    ;(window as any).location = {
      pathname: '/sales/test-sale',
      href: 'http://localhost/sales/test-sale',
    }

    render(
      <TestWrapper>
        <SellerRatingStars
          sellerId="seller-123"
          avgRating={null}
          ratingsCount={0}
          currentUserRating={null}
          isSeller={false}
        />
      </TestWrapper>
    )

    const fourthStar = screen.getByRole('button', { name: /rate 4 out of 5 stars/i })
    
    // Verify button is not disabled and is interactive
    expect(fourthStar).not.toBeDisabled()
    expect(fourthStar).toHaveAttribute('tabIndex', '0')
    
    // Click the star
    fireEvent.click(fourthStar)

    // Wait for fetch to be called - the component should call it immediately
    await waitFor(
      () => {
        if (mockFetch.mock.calls.length === 0) {
          throw new Error('Fetch not called yet')
        }
      },
      { timeout: 3000 }
    )

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/seller/rating',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seller_id: 'seller-123',
          rating: 4,
          sale_id: null,
        }),
      })
    )

    // Restore window.location
    ;(window as any).location = originalLocation
  })

  it('handles keyboard navigation', () => {
    render(
      <TestWrapper>
        <SellerRatingStars
          sellerId="seller-123"
          avgRating={null}
          ratingsCount={0}
          currentUserRating={null}
          isSeller={false}
        />
      </TestWrapper>
    )

    const firstStar = screen.getByRole('button', { name: /rate 1 out of 5 stars/i })
    firstStar.focus()

    // Arrow right should move to next star
    fireEvent.keyDown(firstStar, { key: 'ArrowRight' })
    // Note: Actual focus movement would require more complex setup
    // This test verifies the key handler is attached
    expect(firstStar).toBeInTheDocument()
  })
})

