import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AddSaleForm from '@/components/AddSaleForm'

// Use global mocks from tests/setup.ts

describe('AddSaleForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form fields', () => {
    render(<AddSaleForm />)
    
    expect(screen.getByLabelText('Sale Title *')).toBeInTheDocument()
    expect(screen.getByLabelText('Address *')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
    expect(screen.getByLabelText('Contact Info')).toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText('Sale Title *'), {
      target: { value: 'Test Sale' }
    })
    fireEvent.change(screen.getByLabelText('Address *'), {
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
    
    const addressInput = screen.getByLabelText('Address *')
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
    
    const tagInput = screen.getByPlaceholderText('Add a tag...')
    fireEvent.change(tagInput, { target: { value: 'furniture' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })

    expect(screen.getByText('furniture')).toBeInTheDocument()

    // Remove tag
    const removeButtons = screen.getAllByRole('button')
    fireEvent.click(removeButtons.find(b => b.textContent === '×') as HTMLElement)

    expect(screen.queryByText('furniture')).not.toBeInTheDocument()
  })

  it('validates price range', async () => {
    render(<AddSaleForm />)
    
    const minPriceInput = screen.getByLabelText('Min Price ($)')
    const maxPriceInput = screen.getByLabelText('Max Price ($)')

    fireEvent.change(minPriceInput, { target: { value: '100' } })
    fireEvent.change(maxPriceInput, { target: { value: '50' } })

    const submitButton = screen.getByRole('button', { name: /post sale/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Please complete required fields')).toBeInTheDocument()
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
