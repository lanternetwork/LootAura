import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SalesClient from '@/app/sales/SalesClient'
import { normalizeGeocode } from '@/lib/contracts/geocode'

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

describe('ZIP Flow Integration', () => {
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

  it('renders sales page with providers', () => {
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
    
    expect(screen.getByTestId('sales-root-mobile')).toBeInTheDocument()
    expect(screen.getByTestId('zip-input-desktop')).toBeInTheDocument()
  })

  it('simulates entering 40204 and pressing Enter', async () => {
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
    
    const zipInput = screen.getAllByTestId('zip-input-desktop')[0]
    fireEvent.change(zipInput, { target: { value: '40204' } })
    
    // Wait for the input to be enabled
    await waitFor(() => {
      expect(zipInput).not.toBeDisabled()
    })
    
    fireEvent.keyDown(zipInput, { key: 'Enter' })
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/geocoding/zip?zip=40204')
    })
  })

  it('asserts root has data-debug-intent="Filters:Zip" after ZIP search', async () => {
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
    
    const zipInput = screen.getAllByTestId('zip-input-desktop')[0]
    fireEvent.change(zipInput, { target: { value: '40204' } })
    
    // Wait for the input to be enabled
    await waitFor(() => {
      expect(zipInput).not.toBeDisabled()
    })
    
    fireEvent.keyDown(zipInput, { key: 'Enter' })
    
    await waitFor(() => {
      const salesRoot = screen.getByTestId('sales-root-mobile')
      expect(salesRoot).toHaveAttribute('data-debug-intent', 'Filters:Zip')
    })
  })

  it('normalizes geocode response correctly', () => {
    const normalized = normalizeGeocode(mockGeocodeResponse)
    expect(normalized).toEqual({
      lat: 38.2380249,
      lng: -85.7246945,
      city: 'Louisville',
      state: 'KY',
      zip: '40204',
      source: 'api'
    })
  })

  it('handles wrapped geocode response format', () => {
    const wrappedResponse = {
      data: {
        lat: 38.2380249,
        lng: -85.7246945,
        city: 'Louisville',
        state: 'KY',
        zip: '40204',
        source: 'api'
      }
    }
    
    const normalized = normalizeGeocode(wrappedResponse)
    expect(normalized).toEqual({
      lat: 38.2380249,
      lng: -85.7246945,
      city: 'Louisville',
      state: 'KY',
      zip: '40204',
      source: 'api'
    })
  })
})
