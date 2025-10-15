import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FavoriteButton from '@/components/FavoriteButton'
import { useAuth, useFavorites, useToggleFavorite } from '@/lib/hooks/useAuth'

// Mock the auth hooks
vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null
  })),
  useFavorites: vi.fn(() => ({
    data: []
  })),
  useToggleFavorite: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false
  }))
}))

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

describe('FavoriteButton', () => {
  it('renders save button when not favorited', () => {
    render(
      <TestWrapper>
        <FavoriteButton saleId="test-sale-id" />
      </TestWrapper>
    )

    // Component uses icon, not text - check by aria-label
    expect(screen.getByLabelText('Save sale')).toBeInTheDocument()
  })

  it('renders saved button when favorited', () => {
    // Mock the hook to return a favorited sale
    vi.mocked(useFavorites).mockReturnValueOnce({
      data: [{ id: 'test-sale-id', title: 'Test Sale' }],
      isLoading: false,
      error: null
    } as any)

    render(
      <TestWrapper>
        <FavoriteButton saleId="test-sale-id" />
      </TestWrapper>
    )

    expect(screen.getByLabelText('Unsave sale')).toBeInTheDocument()
  })

  it('calls toggle function when clicked', async () => {
    const mockToggle = vi.fn()
    // Mock authenticated user so component doesn't redirect
    vi.mocked(useAuth).mockReturnValueOnce({
      data: { id: 'test-user', email: 'test@example.com' },
      isLoading: false,
      error: null
    } as any)

    vi.mocked(useToggleFavorite).mockReturnValueOnce({
      mutate: mockToggle,
      isPending: false
    } as any)

    render(
      <TestWrapper>
        <FavoriteButton saleId="test-sale-id" />
      </TestWrapper>
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockToggle).toHaveBeenCalledWith({
        saleId: 'test-sale-id',
        isFavorited: false
      })
    })
  })

  it('shows loading state when pending', () => {
    vi.mocked(useToggleFavorite).mockReturnValueOnce({
      mutate: vi.fn(),
      isPending: true
    } as any)

    render(
      <TestWrapper>
        <FavoriteButton saleId="test-sale-id" />
      </TestWrapper>
    )

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
  })

  it('has correct ARIA attributes', () => {
    render(
      <TestWrapper>
        <FavoriteButton saleId="test-sale-id" />
      </TestWrapper>
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveAttribute('aria-label', 'Save sale')
  })
})
