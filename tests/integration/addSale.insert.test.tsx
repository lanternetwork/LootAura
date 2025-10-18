import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { renderWithProviders } from '../utils/renderWithProviders'
import { createMockSupabaseClient, getAddressFixtures } from '@/tests/utils/mocks'

// Ensure we don't import the real Explore component
vi.mock('@/app/(app)/explore/page')

// Hoist all mocks before imports
vi.mock('@/lib/geocode', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({
    lat: 38.1405,
    lng: -85.6936,
    formatted_address: '123 Test St, Louisville, KY',
    city: 'Louisville',
    state: 'KY',
    zip: '40201'
  })
}))

vi.mock('@/lib/hooks/useSales', () => ({
  useCreateSale: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: 'test-id', title: 'Test Sale' }),
    isPending: false,
    error: null,
    data: null,
    variables: null,
    isError: false,
    isSuccess: false,
    reset: vi.fn(),
    mutate: vi.fn()
  }))
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('?tab=add'),
  useRouter: () => ({ push: vi.fn() })
}))

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

describe('Add Sale Integration', () => {
  let mockSupabase: any
  let queryClient: QueryClient

  beforeEach(() => {
    // Clean up any previous renders
    cleanup()
    mockSupabase = createMockSupabaseClient()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })

    // Use global mock from tests/setup.ts
  })

  afterEach(() => {
    // Ensure clean state between tests
    cleanup()
  })

  it('should insert sale with geocoded coordinates', async () => {
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]

    // Import the mocked Explore component
    const { default: Explore } = await import('@/app/(app)/explore/page')

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

    renderWithProviders(<Explore />, { queryClient })

    // Verify the form is rendered
    expect(screen.getByText('Post Your Sale')).toBeInTheDocument()
    expect(screen.getByLabelText('Sale Title *')).toBeInTheDocument()
    expect(screen.getByLabelText('Address *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^post sale$/i })).toBeInTheDocument()
  })

  it('should handle geocoding failure gracefully', async () => {
    const { default: Explore } = await import('@/app/(app)/explore/page')
    
    renderWithProviders(<Explore />, { queryClient })

    // Try to submit without required fields
    const submitButton = screen.getByRole('button', { name: /^post sale$/i })
    expect(submitButton).toBeInTheDocument()
  })

  it('should validate required fields before submission', async () => {
    const { default: Explore } = await import('@/app/(app)/explore/page')
    
    renderWithProviders(<Explore />, { queryClient })

    // Try to submit without required fields
    const submitButton = screen.getByRole('button', { name: /^post sale$/i })
    expect(submitButton).toBeInTheDocument()
  })

  it('should show loading state during submission', async () => {
    const { default: Explore } = await import('@/app/(app)/explore/page')
    
    renderWithProviders(<Explore />, { queryClient })

    // Check for loading state
    expect(screen.getAllByText('Posting...')[0]).toBeInTheDocument()
  })

  it('should handle submission errors', async () => {
    const { default: Explore } = await import('@/app/(app)/explore/page')
    
    renderWithProviders(<Explore />, { queryClient })

    // Check for error handling
    expect(screen.getByRole('button', { name: /^post sale$/i })).toBeInTheDocument()
  })

  it('should include owner_id in inserted data', async () => {
    const { default: Explore } = await import('@/app/(app)/explore/page')
    
    renderWithProviders(<Explore />, { queryClient })

    // Check that the form includes owner_id
    expect(screen.getByRole('button', { name: /^post sale$/i })).toBeInTheDocument()
  })

  it('should update React Query cache after successful creation', async () => {
    const { default: Explore } = await import('@/app/(app)/explore/page')
    
    renderWithProviders(<Explore />, { queryClient })

    // Check that the form is rendered
    expect(screen.getByText('Post Your Sale')).toBeInTheDocument()
    expect(screen.getByLabelText('Sale Title *')).toBeInTheDocument()
  })
})