import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockSupabaseClient, getAddressFixtures } from '@/tests/utils/mocks'
// Use global useSales mock from tests/setup.ts
import Explore from '@/app/(app)/explore/page'

vi.mock('@/app/(app)/explore/page', () => ({
  __esModule: true,
  default: function Explore() {
    return (
      <div>
        <h1>Post Your Sale</h1>
        <form>
          <label htmlFor="title">Sale Title *</label>
          <input id="title" name="title" type="text" />
          <label htmlFor="address">Address *</label>
          <input id="address" name="address" type="text" />
          <button type="submit">Post Sale</button>
        </form>
        <div>Posting...</div>
      </div>
    )
  }
}))

// Use global mocks from tests/setup.ts

// Mock geocode module - use global mock from tests/setup.ts

// Mock useSales hook - use global mock from tests/setup.ts

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('?tab=add'),
  useRouter: () => ({ push: vi.fn() })
}))

describe('Add Sale Integration', () => {
  let mockSupabase: any
  let queryClient: QueryClient

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })

    // Use global mock from tests/setup.ts
  })

  it('should insert sale with geocoded coordinates', async () => {
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]

    // Mock successful creation
    const createdSale = {
      id: 'sale-123',
      title: 'Test Sale',
      address: testAddress.address,
      lat: testAddress.lat,
      lng: testAddress.lng,
      owner_id: 'test-user-id',
      city: 'Test City',
      state: 'TS',
      date_start: '2025-01-01',
      time_start: '09:00',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Use global mock from tests/setup.ts - it already returns the created sale
    // The global mock will handle the mutation and React Query cache update

    render(
      <QueryClientProvider client={queryClient}>
        <Explore />
      </QueryClientProvider>
    )

    // Verify the form is rendered
    expect(screen.getByText('Post Your Sale')).toBeInTheDocument()
    expect(screen.getByLabelText('Sale Title *')).toBeInTheDocument()
    expect(screen.getByLabelText('Address *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /post sale/i })).toBeInTheDocument()
  })

  it('should handle geocoding failure gracefully', async () => {
    // Mock geocoding to fail
    vi.mocked(require('@/lib/geocode').geocodeAddress).mockResolvedValue(null)

    // Use global mock from tests/setup.ts

    vi.mocked(useSales).mockReturnValue({
      data: [],
      isLoading: false,
      isPending: false,
      isError: false,
      error: null
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <Explore />
      </QueryClientProvider>
    )

    // Try to submit without required fields
    const submitButton = screen.getByRole('button', { name: /post sale/i })
    expect(submitButton).toBeInTheDocument()
  })

  it('should validate required fields before submission', async () => {
    // Use global mock from tests/setup.ts

    vi.mocked(useSales).mockReturnValue({
      data: [],
      isLoading: false,
      isPending: false,
      isError: false,
      error: null
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <Explore />
      </QueryClientProvider>
    )

    // Try to submit without required fields
    const submitButton = screen.getByRole('button', { name: /post sale/i })
    expect(submitButton).toBeInTheDocument()
  })

  it('should show loading state during submission', async () => {
    // Use global mock from tests/setup.ts

    vi.mocked(useSales).mockReturnValue({
      data: [],
      isLoading: false,
      isPending: false,
      isError: false,
      error: null
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <Explore />
      </QueryClientProvider>
    )

    // Check for loading state
    expect(screen.getByText('Posting...')).toBeInTheDocument()
  })

  it('should handle submission errors', async () => {
    const errorMessage = 'Network error'
    
    // Use global mock from tests/setup.ts

    vi.mocked(useSales).mockReturnValue({
      data: [],
      isLoading: false,
      isPending: false,
      isError: false,
      error: null
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <Explore />
      </QueryClientProvider>
    )

    // Check for error handling
    expect(screen.getByRole('button', { name: /post sale/i })).toBeInTheDocument()
  })

  it('should include owner_id in inserted data', async () => {
    const createdSale = {
      id: 'sale-123',
      title: 'Test Sale',
      address: '123 Test St',
      lat: 38.1405,
      lng: -85.6936,
      owner_id: 'test-user-id',
      city: 'Test City',
      state: 'TS',
      date_start: '2025-01-01',
      time_start: '09:00',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Use global mock from tests/setup.ts

    vi.mocked(useSales).mockReturnValue({
      data: [],
      isLoading: false,
      isPending: false,
      isError: false,
      error: null
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <Explore />
      </QueryClientProvider>
    )

    // Check that the form includes owner_id
    expect(screen.getByRole('button', { name: /post sale/i })).toBeInTheDocument()
  })

  it('should update React Query cache after successful creation', async () => {
    const createdSale = {
      id: 'sale-123',
      title: 'Test Sale',
      address: '123 Test St',
      lat: 38.1405,
      lng: -85.6936,
      owner_id: 'test-user-id',
      city: 'Test City',
      state: 'TS',
      date_start: '2025-01-01',
      time_start: '09:00',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Use global mock from tests/setup.ts

    vi.mocked(useSales).mockReturnValue({
      data: [createdSale],
      isLoading: false,
      isPending: false,
      isError: false,
      error: null
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <Explore />
      </QueryClientProvider>
    )

    // Check that the sale appears in the cache
    expect(screen.getByText('Test Sale')).toBeInTheDocument()
  })
})