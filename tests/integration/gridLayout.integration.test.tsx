import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import SalesClient from '@/app/sales/SalesClient'
import { Sale } from '@/lib/types'

// Mock dependencies
jest.mock('@/lib/hooks/useFilters', () => ({
  __esModule: true,
  default: () => ({
    filters: {
      lat: 38.1405,
      lng: -85.6936,
      distance: 25,
      dateRange: 'any',
      categories: []
    },
    updateFilters: jest.fn()
  })
}))

jest.mock('@/lib/hooks/useSales', () => ({
  __esModule: true,
  default: () => ({
    sales: [],
    loading: false,
    fetchSales: jest.fn(),
    fetchMapSales: jest.fn()
  })
}))

jest.mock('@/components/location/SalesMap', () => {
  return function MockSalesMap() {
    return <div data-testid="sales-map">Mock Map</div>
  }
})

jest.mock('@/components/SaleCard', () => {
  return function MockSaleCard({ sale }: { sale: Sale }) {
    return <div data-testid="sale-card">{sale.title}</div>
  }
})

const mockSales: Sale[] = [
  { id: '1', title: 'Sale 1', description: 'Desc 1', lat: 0, lng: 0, date_start: '2025-01-01', time_start: '09:00' },
  { id: '2', title: 'Sale 2', description: 'Desc 2', lat: 0, lng: 0, date_start: '2025-01-01', time_start: '09:00' },
  { id: '3', title: 'Sale 3', description: 'Desc 3', lat: 0, lng: 0, date_start: '2025-01-01', time_start: '09:00' },
  { id: '4', title: 'Sale 4', description: 'Desc 4', lat: 0, lng: 0, date_start: '2025-01-01', time_start: '09:00' },
]

describe('Grid Layout Integration', () => {
  it('should render sales as direct children of grid container', () => {
    render(
      <SalesClient
        initialSales={mockSales}
        initialSearchParams={{}}
        initialCenter={{ lat: 38.1405, lng: -85.6936 }}
        user={null}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    expect(gridContainer).toBeInTheDocument()
    expect(gridContainer).toHaveClass('grid')
    expect(gridContainer).toHaveClass('grid-cols-1')
    expect(gridContainer).toHaveClass('sm:grid-cols-2')
    expect(gridContainer).toHaveClass('lg:grid-cols-3')
  })

  it('should have correct grid classes at different breakpoints', () => {
    const { rerender } = render(
      <SalesClient
        initialSales={mockSales}
        initialSearchParams={{}}
        initialCenter={{ lat: 38.1405, lng: -85.6936 }}
        user={null}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    
    // Should have responsive grid classes
    expect(gridContainer.className).toContain('grid')
    expect(gridContainer.className).toContain('grid-cols-1')
    expect(gridContainer.className).toContain('sm:grid-cols-2')
    expect(gridContainer.className).toContain('lg:grid-cols-3')
    expect(gridContainer.className).toContain('gap-6')
  })

  it('should not have wrapper divs around sale cards', () => {
    render(
      <SalesClient
        initialSales={mockSales}
        initialSearchParams={{}}
        initialCenter={{ lat: 38.1405, lng: -85.6936 }}
        user={null}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    const saleCards = screen.getAllByTestId('sale-card')
    
    // Sale cards should be direct children of grid container
    saleCards.forEach(card => {
      expect(gridContainer).toContainElement(card)
      // Card should not be wrapped in a div with grid-item class
      expect(card.parentElement).toBe(gridContainer)
    })
  })
})
