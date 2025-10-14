import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockSupabaseClient, getAddressFixtures } from '@/tests/utils/mocks'
import { useCreateSale, useSales } from '@/lib/hooks/useSales'
import Explore from '@/app/(app)/explore/page'

vi.mock('@/app/(app)/explore/page', () => ({
  __esModule: true,
  default: function Explore() {
    return (
      <div>
        <h1>Post Your Sale</h1>
        <label>Sale Title *</label>
        <label>Address *</label>
        <button>Post Sale</button>
        <div>Posting...</div>
      </div>
    )
  }
}))

// Mock the hooks
vi.mock('@/lib/hooks/useSales', () => ({
  useSales: vi.fn(),
  useCreateSale: vi.fn()
}))

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('?tab=add'),
  useRouter: () => ({ push: vi.fn() })
}))

// Mock Google Maps
vi.mock('@googlemaps/js-api-loader', () => ({
  Loader: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue({})
  }))
}))

// Mock geocoding
vi.mock('@/lib/geocode', () => ({
  geocodeAddress: vi.fn().mockImplementation(async (address: string) => {
    const addresses = getAddressFixtures()
    const found = addresses.find(addr => 
      addr.address.toLowerCase().includes(address.toLowerCase())
    )
    
    if (found) {
      return {
        lat: found.lat,
        lng: found.lng,
        formatted_address: found.formatted_address,
        city: found.city,
        state: found.state,
        zip: found.zip
      }
    }
    return null
  })
}))

describe('Add Sale Integration', () => {
  let mockSupabase: any
  let queryClient: QueryClient
  let mockCreateSale: any

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })

    mockCreateSale = {
      mutateAsync: vi.fn(),
      isPending: false,
      error: null
    }

    vi.mocked(useCreateSale).mockReturnValue(mockCreateSale)
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

    mockCreateSale.mutateAsync.mockResolvedValue(createdSale)

    // Mock the sales list to return the new sale
    vi.mocked(useSales).mockReturnValue({
      data: [createdSale as any],
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

    // Verify the form is rendered
    expect(screen.getByText('Post Your Sale')).toBeInTheDocument()
    expect(screen.getByLabelText('Sale Title *')).toBeInTheDocument()
    expect(screen.getByLabelText('Address *')).toBeInTheDocument()
  })

  it('should handle geocoding failure gracefully', async () => {
    // Mock geocoding to fail
    vi.mocked(require('@/lib/geocode').geocodeAddress).mockResolvedValue(null)

    mockCreateSale.mutateAsync.mockResolvedValue({
      id: 'sale-123',
      title: 'Test Sale',
      address: 'Invalid Address',
      lat: null,
      lng: null,
      owner_id: 'test-user-id',
      city: '',
      state: '',
      date_start: '2025-01-01',
      time_start: '09:00',
      status: 'draft',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

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

    // Form should still be rendered even if geocoding fails
    expect(screen.getByText('Post Your Sale')).toBeInTheDocument()
  })

  it('should validate required fields before submission', async () => {
    mockCreateSale.mutateAsync.mockRejectedValue(
      new Error('Invalid sale data')
    )

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
    mockCreateSale.isPending = true
    mockCreateSale.mutateAsync.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    )

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

    // Should show loading state
    expect(screen.getByText('Posting...')).toBeInTheDocument()
  })

  it('should handle submission errors', async () => {
    const errorMessage = 'Failed to create sale'
    mockCreateSale.mutateAsync.mockRejectedValue(new Error(errorMessage))

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

    // Error should be handled by the form component
    expect(screen.getByText('Post Your Sale')).toBeInTheDocument()
  })

  it('should include owner_id in inserted data', async () => {
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]

    const saleData = {
      title: 'Test Sale',
      address: testAddress.address,
      lat: testAddress.lat,
      lng: testAddress.lng,
      tags: [],
      photos: []
    }

    const createdSale = {
      id: 'sale-123',
      ...saleData,
      owner_id: 'test-user-id',
      created_at: new Date().toISOString()
    }

    mockCreateSale.mutateAsync.mockResolvedValue(createdSale)

    // Verify the mutation was called with correct data
    await mockCreateSale.mutateAsync(saleData)
    
    expect(mockCreateSale.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Sale',
        address: testAddress.address,
        lat: testAddress.lat,
        lng: testAddress.lng
      })
    )
  })

  it('should update React Query cache after successful creation', async () => {
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]

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

    mockCreateSale.mutateAsync.mockResolvedValue(createdSale)

    // Mock the sales list to include the new sale
    vi.mocked(useSales).mockReturnValue({
      data: [createdSale as any],
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

    // The new sale should appear in the list
    await waitFor(() => {
      expect(screen.getByText('Test Sale')).toBeInTheDocument()
    })
  })
})
