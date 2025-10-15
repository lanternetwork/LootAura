import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FavoriteButton from '@/components/FavoriteButton'

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

    expect(screen.getByText('♡ Save')).toBeInTheDocument()
  })

  it('renders saved button when favorited', () => {
    // Mock the hook to return a favorited sale
    const { useFavorites } = require('@/lib/hooks/useAuth')
    vi.mocked(useFavorites).mockReturnValue({
      data: [{ id: 'test-sale-id', title: 'Test Sale' }]
    })

    render(
      <TestWrapper>
        <FavoriteButton saleId="test-sale-id" />
      </TestWrapper>
    )

    expect(screen.getByText('♥ Saved')).toBeInTheDocument()
  })

  it('calls toggle function when clicked', async () => {
    const mockToggle = vi.fn()
    const { useToggleFavorite } = require('@/lib/hooks/useAuth')
    vi.mocked(useToggleFavorite).mockReturnValue({
      mutate: mockToggle,
      isPending: false
    })

    render(
      <TestWrapper>
        <FavoriteButton saleId="test-sale-id" />
      </TestWrapper>
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(mockToggle).toHaveBeenCalledWith({
      saleId: 'test-sale-id',
      isFavorited: false
    })
  })

  it('shows loading state when pending', () => {
    const { useToggleFavorite } = require('@/lib/hooks/useAuth')
    vi.mocked(useToggleFavorite).mockReturnValue({
      mutate: vi.fn(),
      isPending: true
    })

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
  })
})
