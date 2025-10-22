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
      json: () => Promise.resolve(mockGeocodeResponse)
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
    const zipInput = zipInputs[0] // Use the first one (desktop version)
    fireEvent.change(zipInput, { target: { value: '40204' } })
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

  it('simulated real drag → intent flips to UserPan', async () => {
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
    
    // Simulate a user drag gesture by triggering map move events
    // This would need to be adapted based on your map component's event handling
    const mapContainers = screen.getAllByTestId('map-container')
    const mapContainer = mapContainers[0] // Use the first one
    
    // Simulate user interaction that would trigger UserPan intent
    fireEvent.mouseDown(mapContainer, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(mapContainer, { clientX: 150, clientY: 150 })
    fireEvent.mouseUp(mapContainer)
    
    await waitFor(() => {
      const salesRoot = screen.getByTestId('sales-root')
      expect(salesRoot).toHaveAttribute('data-debug-intent', /UserPan/)
    })
  })
})
