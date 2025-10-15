import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AddSaleForm from '@/components/AddSaleForm'
import { useCreateSale } from '@/lib/hooks/useSales'

// Use global mocks from tests/setup.ts (useCreateSale is already mocked)

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
    
    // Fill with invalid data that fails schema (title too short)
    fireEvent.change(screen.getByLabelText('Sale Title *'), {
      target: { value: 'Te' }
    })
    // Fill address to satisfy HTML5 required and allow submit handler
    fireEvent.change(screen.getByLabelText('Address *'), {
      target: { value: '123 Test St' }
    })

    const submitButton = screen.getByRole('button', { name: /post sale/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Please complete required fields')
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

  it('adds and removes tags', async () => {
    render(<AddSaleForm />)
    
    const tagInput = screen.getByPlaceholderText('Add a tag...')
    fireEvent.change(tagInput, { target: { value: 'furniture' } })
    fireEvent.keyPress(tagInput, { key: 'Enter', code: 'Enter', charCode: 13 })

    await waitFor(() => {
      expect(screen.getByText('furniture')).toBeInTheDocument()
    })

    // Remove tag
    const removeButton = screen.getByTestId('tag-remove')
    fireEvent.click(removeButton)

    await waitFor(() => {
      expect(screen.queryByText('furniture')).not.toBeInTheDocument()
    })
  })

  it.skip('validates price range', async () => {
    // Skipped: price range validation not currently enforced by schema
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
