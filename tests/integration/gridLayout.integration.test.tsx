import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import SalesClient from '@/app/sales/SalesClient'
import { Sale } from '@/lib/types'
import { makeSales } from '../_helpers/factories'

// Mock dependencies
vi.mock('@/lib/hooks/useFilters', () => ({
  __esModule: true,
  useFilters: () => ({
    filters: {
      lat: 38.1405,
      lng: -85.6936,
      distance: 25,
      dateRange: 'any',
      categories: []
    },
    updateFilters: vi.fn()
  })
}))

// Mock to force FILTERS authority (not MAP) to prevent list suppression
vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    authority: 'FILTERS' // Force FILTERS authority for this test
  })
}))

// Use global useSales mock from tests/setup.ts
vi.mock('@/lib/hooks/useSales', () => ({
  __esModule: true,
  default: () => ({
    sales: makeSales(4, [
      { title: 'Sale 1', description: 'Desc 1' },
      { title: 'Sale 2', description: 'Desc 2' },
      { title: 'Sale 3', description: 'Desc 3' },
      { title: 'Sale 4', description: 'Desc 4' }
    ]),
    loading: false,
    fetchSales: vi.fn(),
    fetchMapSales: vi.fn()
  })
}))

vi.mock('@/components/location/SalesMap', () => ({
  __esModule: true,
  default: () => <div data-testid="sales-map">Mock Map</div>,
}))

vi.mock('@/components/SaleCard', () => ({
  __esModule: true,
  default: function MockSaleCard({ sale }: { sale: Sale }) {
    return <div data-testid="sale-card" className="sale-row">{sale.title}</div>
  }
}))

const mockSales = makeSales(4, [
  { title: 'Sale 1', description: 'Desc 1' },
  { title: 'Sale 2', description: 'Desc 2' },
  { title: 'Sale 3', description: 'Desc 3' },
  { title: 'Sale 4', description: 'Desc 4' }
])

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
    // Set deterministic width before rendering
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { 
      configurable: true, 
      value: 1200 
    })
    
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
    // Set deterministic width before rendering
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { 
      configurable: true, 
      value: 1200 
    })
    
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

  it('should maintain grid layout during loading states', () => {
    const { rerender } = render(
      <SalesClient
        initialSales={[]}
        initialSearchParams={{}}
        initialCenter={{ lat: 38.1405, lng: -85.6936 }}
        user={null}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    expect(gridContainer).toHaveClass('grid')
    expect(gridContainer).toHaveClass('grid-cols-1')
  })

  it('should handle empty state without breaking grid', () => {
    render(
      <SalesClient
        initialSales={[]}
        initialSearchParams={{}}
        initialCenter={{ lat: 38.1405, lng: -85.6936 }}
        user={null}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    expect(gridContainer).toBeInTheDocument()
    expect(gridContainer).toHaveClass('grid')
  })

  it('should not have multiple column-defining classes', () => {
    render(
      <SalesClient
        initialSales={mockSales}
        initialSearchParams={{}}
        initialCenter={{ lat: 38.1405, lng: -85.6936 }}
        user={null}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    const className = gridContainer.className
    
    // Count base grid-cols-* classes (not responsive ones)
    const baseColumnClasses = className.match(/\bgrid-cols-\d+\b/g) || []
    expect(baseColumnClasses.length).toBeLessThanOrEqual(1) // Only base class, responsive classes are different
  })
})
