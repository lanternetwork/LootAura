import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SalesList from '@/components/SalesList'

// Mock the sales data
const mockSales = [
  {
    id: '1',
    title: 'Vintage Chair',
    description: 'Beautiful vintage chair',
    price: 50,
    location: 'Louisville, KY',
    date: '2024-01-15',
    category: 'furniture',
    images: ['https://example.com/chair.jpg']
  },
  {
    id: '2', 
    title: 'Power Tools',
    description: 'Set of power tools',
    price: 100,
    location: 'Nashville, TN',
    date: '2024-01-16',
    category: 'tools',
    images: ['https://example.com/tools.jpg']
  }
]

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
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  it('should render sales list with proper grid layout', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SalesList sales={mockSales} />
      </QueryClientProvider>
    )

    // Check that sales are rendered
    expect(screen.getByText('Vintage Chair')).toBeInTheDocument()
    expect(screen.getByText('Power Tools')).toBeInTheDocument()
    
    // Check grid container exists
    const gridContainer = screen.getByTestId('sales-list')
    expect(gridContainer).toBeInTheDocument()
    expect(gridContainer).toHaveClass('grid')
  })

  it('should handle empty sales list', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SalesList sales={[]} />
      </QueryClientProvider>
    )

    // Should show empty state
    expect(screen.getByText(/no sales found/i)).toBeInTheDocument()
  })

  it('should filter sales by category', () => {
    const filteredSales = mockSales.filter(sale => sale.category === 'furniture')
    
    render(
      <QueryClientProvider client={queryClient}>
        <SalesList sales={filteredSales} />
      </QueryClientProvider>
    )

    // Should only show furniture
    expect(screen.getByText('Vintage Chair')).toBeInTheDocument()
    expect(screen.queryByText('Power Tools')).not.toBeInTheDocument()
  })
})
