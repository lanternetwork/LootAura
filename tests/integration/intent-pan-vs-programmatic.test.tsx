import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SalesClient from '@/app/sales/SalesClient'

// Mock the geocode API
const mockGeocodeResponse = {
  lat: 38.2380249,
  lng: -85.7246945,
  city: 'Louisville',
  state: 'KY',
  zip: '40204',
  source: 'api'
}

global.fetch = vi.fn()

describe('Intent Pan vs Programmatic', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
    
    // Mock successful geocode response
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        ...mockGeocodeResponse
      })
    } as Response)
  })

  it('programmatic center from ZIP → root stays Filters:Zip', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SalesClient
          initialSales={[]}
          initialSearchParams={{}}
          initialCenter={{ lat: 39.8283, lng: -98.5795 }}
          user={null}
        />
      </QueryClientProvider>
    )
    
    const zipInputs = screen.getAllByTestId('zip-input')
    const zipInput = zipInputs[0] // Use the first one (mobile)
    fireEvent.change(zipInput, { target: { value: '40204' } })
    
    // Wait for the input to be enabled
    await waitFor(() => {
      expect(zipInput).not.toBeDisabled()
    })
    
    fireEvent.keyDown(zipInput, { key: 'Enter' })
    
    await waitFor(() => {
      const salesRoot = screen.getByTestId('sales-root')
      expect(salesRoot).toHaveAttribute('data-debug-intent', 'Filters:Zip')
    })
    
    // Verify it stays as Filters:Zip even after the programmatic move
    await waitFor(() => {
      const salesRoot = screen.getByTestId('sales-root')
      expect(salesRoot).toHaveAttribute('data-debug-intent', 'Filters:Zip')
    })
  })

  it('verifies intent system is working', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SalesClient
          initialSales={[]}
          initialSearchParams={{}}
          initialCenter={{ lat: 39.8283, lng: -98.5795 }}
          user={null}
        />
      </QueryClientProvider>
    )
    
    // Check that the initial intent is set correctly
    const salesRoot = screen.getByTestId('sales-root')
    expect(salesRoot).toHaveAttribute('data-debug-intent', 'Filters:')
  })
})
