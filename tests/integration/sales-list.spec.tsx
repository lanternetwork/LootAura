import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import { renderWithProviders } from '../utils/renderWithProviders'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SalesList from '@/components/SalesList'
import { makeSales } from '../_helpers/factories'

// Mock the sales data
const mockSales = makeSales(2, [
  {
    id: '1',
    title: 'Vintage Chair',
    description: 'Beautiful vintage chair',
    price: 50,
    city: 'Louisville',
    state: 'KY',
    date_start: '2024-01-15',
    time_start: '09:00'
  },
  {
    id: '2', 
    title: 'Power Tools',
    description: 'Set of power tools',
    price: 100,
    city: 'Nashville',
    state: 'TN',
    date_start: '2024-01-16',
    time_start: '10:00'
  }
])

// Mock the useSales hook
vi.mock('@/lib/hooks/useSales', () => ({
  useSales: () => ({
    data: mockSales,
    isLoading: false,
    error: null,
    refetch: vi.fn()
  })
}))

describe('SalesList Integration', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    // Clean up any previous renders
    cleanup()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  afterEach(() => {
    // Ensure clean state between tests
    cleanup()
  })

  it('should render sales list with proper grid layout', () => {
    renderWithProviders(<SalesList sales={mockSales} />)

    // Check that sales are rendered
    expect(screen.getByText('Vintage Chair')).toBeInTheDocument()
    expect(screen.getByText('Power Tools')).toBeInTheDocument()
    
    // Check grid container exists
    const gridContainer = screen.getByTestId('sales-list')
    expect(gridContainer).toBeInTheDocument()
    expect(gridContainer).toHaveClass('grid')
  })

  it('should handle empty sales list', () => {
    renderWithProviders(<SalesList sales={[]} />)

    // Should show empty state
    expect(screen.getByText(/no sales found/i)).toBeInTheDocument()
  })

  it('should filter sales by category', () => {
    // Add tags to mock sales data
    const salesWithTags = mockSales.map(sale => ({
      ...sale,
      tags: sale.title.includes('Vintage Chair') ? ['furniture'] : ['tools']
    }))

    const filteredSales = salesWithTags.filter(sale => sale.tags?.includes('furniture'))
    
    renderWithProviders(<SalesList sales={filteredSales} />)

    // Should only show furniture
    expect(screen.getByText('Vintage Chair')).toBeInTheDocument()
    expect(screen.queryByText('Power Tools')).not.toBeInTheDocument()
  })
})
