import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SalesGrid from '@/components/SalesGrid'
import { Sale } from '@/lib/types'

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock sales data
const mockSales: Sale[] = [
  {
    id: '1',
    title: 'Test Sale 1',
    description: 'Test description',
    address: '123 Test St',
    city: 'Test City',
    state: 'TS',
    lat: 38.0,
    lng: -85.0,
    date_start: '2025-01-01',
    time_start: '09:00',
    price: 0
  },
  {
    id: '2', 
    title: 'Test Sale 2',
    description: 'Test description 2',
    address: '456 Test Ave',
    city: 'Test City',
    state: 'TS',
    lat: 38.1,
    lng: -85.1,
    date_start: '2025-01-02',
    time_start: '10:00',
    price: 0
  }
]

describe('SalesGrid', () => {
  beforeEach(() => {
    // Reset window dimensions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
  })

  it('renders sales in grid layout', () => {
    render(<SalesGrid sales={mockSales} authority="MAP" />)
    
    const grid = screen.getByTestId('sales-grid')
    expect(grid).toBeInTheDocument()
    expect(grid).toHaveClass('sales-grid')
  })

  it('applies correct data attributes', () => {
    render(<SalesGrid sales={mockSales} authority="FILTERS" />)
    
    const grid = screen.getByTestId('sales-grid')
    expect(grid).toHaveAttribute('data-authority', 'FILTERS')
    expect(grid).toHaveAttribute('data-columns')
    expect(grid).toHaveAttribute('data-width')
  })

  it('renders correct number of sales', () => {
    render(<SalesGrid sales={mockSales} authority="MAP" />)
    
    const saleCards = screen.getAllByTestId('sale-card')
    expect(saleCards).toHaveLength(2)
  })

  it('shows loading skeletons when loading', () => {
    render(<SalesGrid sales={[]} authority="MAP" isLoading={true} />)
    
    const skeletons = screen.getAllByText('')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('applies custom className', () => {
    render(<SalesGrid sales={mockSales} authority="MAP" className="custom-class" />)
    
    const grid = screen.getByTestId('sales-grid')
    expect(grid).toHaveClass('custom-class')
  })

  it('handles empty sales array', () => {
    render(<SalesGrid sales={[]} authority="MAP" />)
    
    const grid = screen.getByTestId('sales-grid')
    expect(grid).toBeInTheDocument()
    expect(screen.queryByTestId('sale-card')).not.toBeInTheDocument()
  })
})

describe('SalesGrid Responsive Behavior', () => {
  it('applies correct grid columns for different screen sizes', () => {
    // Test small screen
    Object.defineProperty(window, 'innerWidth', { value: 500 })
    const { rerender } = render(<SalesGrid sales={mockSales} authority="MAP" />)
    
    let grid = screen.getByTestId('sales-grid')
    expect(grid).toHaveAttribute('data-columns', '1')
    
    // Test medium screen
    Object.defineProperty(window, 'innerWidth', { value: 800 })
    rerender(<SalesGrid sales={mockSales} authority="MAP" />)
    
    grid = screen.getByTestId('sales-grid')
    expect(grid).toHaveAttribute('data-columns', '2')
    
    // Test large screen
    Object.defineProperty(window, 'innerWidth', { value: 1200 })
    rerender(<SalesGrid sales={mockSales} authority="MAP" />)
    
    grid = screen.getByTestId('sales-grid')
    expect(grid).toHaveAttribute('data-columns', '3')
  })
})
