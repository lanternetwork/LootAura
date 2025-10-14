import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AddSaleForm from '@/components/AddSaleForm'
import { useCreateSale } from '@/lib/hooks/useSales'

// Mock the hooks
vi.mock('@/lib/hooks/useSales', () => ({
  useCreateSale: vi.fn()
}))

// Mock the geocoding function
vi.mock('@/lib/geocode', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({
    lat: 40.7128,
    lng: -74.0060,
    city: 'New York',
    state: 'NY',
    zip: '10001'
  })
}))

// Removed Google Maps mocks (not used)

// Mock the Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'test-user' } } })
    }
  })
}))

describe('AddSaleForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form fields', () => {
    render(<AddSaleForm />)
    
    expect(screen.getByPlaceholderText('Sale title')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Address')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Description')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Contact info')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /post sale/i })).toBeInTheDocument()
  })

  it('validates required fields', async () => {
    render(<AddSaleForm />)
    
    const submitButton = screen.getByRole('button', { name: /post sale/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Please complete required fields')).toBeInTheDocument()
    })
  })

  it('submits form with valid data', async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'test-id' })
    vi.mocked(useCreateSale).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      error: null,
      data: null,
      variables: null,
      isError: false,
      isSuccess: false,
      reset: vi.fn(),
      mutate: vi.fn()
    } as any)

    render(<AddSaleForm />)
    
    // Fill in required fields
    fireEvent.change(screen.getByPlaceholderText('Sale title'), {
      target: { value: 'Test Sale' }
    })
    fireEvent.change(screen.getByPlaceholderText('Address'), {
      target: { value: '123 Test St' }
    })

    const submitButton = screen.getByRole('button', { name: /post sale/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Sale',
          address: '123 Test St'
        })
      )
    })
  })

  it('handles geocoding on address change', async () => {
    const { geocodeAddress } = await import('@/lib/geocode')
    
    render(<AddSaleForm />)
    
    const addressInput = screen.getByPlaceholderText('Address')
    fireEvent.change(addressInput, {
      target: { value: '123 Test St, New York, NY' }
    })

    // Wait for geocoding to complete
    await waitFor(() => {
      expect(geocodeAddress).toHaveBeenCalledWith('123 Test St, New York, NY')
    })
  })

  it('adds and removes tags', () => {
    render(<AddSaleForm />)
    
    const tagInput = screen.getByPlaceholderText('Add tags (press Enter)')
    fireEvent.change(tagInput, { target: { value: 'furniture' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })

    expect(screen.getByText('furniture')).toBeInTheDocument()

    // Remove tag
    const removeButton = screen.getByRole('button', { name: /remove furniture/i })
    fireEvent.click(removeButton)

    expect(screen.queryByText('furniture')).not.toBeInTheDocument()
  })

  it('validates price range', async () => {
    render(<AddSaleForm />)
    
    const minPriceInput = screen.getByPlaceholderText('Min price')
    const maxPriceInput = screen.getByPlaceholderText('Max price')

    fireEvent.change(minPriceInput, { target: { value: '100' } })
    fireEvent.change(maxPriceInput, { target: { value: '50' } })

    const submitButton = screen.getByRole('button', { name: /post sale/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Min price must be less than max price')).toBeInTheDocument()
    })
  })

  it('shows loading state during submission', () => {
    vi.mocked(useCreateSale).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      error: null,
      data: null,
      variables: null,
      isError: false,
      isSuccess: false,
      reset: vi.fn(),
      mutate: vi.fn()
    } as any)

    render(<AddSaleForm />)
    
    expect(screen.getByText('Posting...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /posting.../i })).toBeDisabled()
  })
})
