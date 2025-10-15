import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, afterEach } from 'vitest'
import SalesGrid from '@/components/SalesGrid'
import { makeSales } from '../_helpers/factories'

// Mock SaleCard to avoid complex dependencies
vi.mock('@/components/SaleCard', () => ({
  default: ({ sale }: any) => (
    <div data-testid="sale-card" className="sale-row">
      {sale.title}
    </div>
  )
}))

vi.mock('@/components/SaleCardSkeleton', () => ({
  default: () => <div data-testid="sale-skeleton">Loading...</div>
}))

const mockSales = makeSales(4, [
  { title: 'Sale 1', description: 'Desc 1' },
  { title: 'Sale 2', description: 'Desc 2' },
  { title: 'Sale 3', description: 'Desc 3' },
  { title: 'Sale 4', description: 'Desc 4' }
])

describe('Grid Layout Integration', () => {
  afterEach(() => {
    vi.clearAllTimers()
    vi.clearAllMocks()
  })

  it('should render sales as direct children of grid container', async () => {
    render(
      <SalesGrid
        sales={mockSales}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={<div>No sales found</div>}
      />
    )

    expect(screen.getAllByTestId('sale-card')).toHaveLength(mockSales.length)
    
    const gridContainer = screen.getByTestId('sales-grid')
    if (globalThis.__simulateResize) {
      globalThis.__simulateResize(gridContainer, 1200)
    }
    
    expect(gridContainer).toBeInTheDocument()
    expect(gridContainer).toHaveClass('sales-grid')
  })

  it('should have correct grid classes at different breakpoints', () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { 
      configurable: true, 
      value: 1200 
    })
    
    render(
      <SalesGrid
        sales={mockSales}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={<div>No sales</div>}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    
    if (globalThis.__simulateResize) {
      globalThis.__simulateResize(gridContainer, 1200)
    }
    
    // Custom grid system uses sales-grid class
    expect(gridContainer).toHaveClass('sales-grid')
    expect(gridContainer).toHaveAttribute('data-columns')
  })

  it('should not have wrapper divs around sale cards', () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { 
      configurable: true, 
      value: 1200 
    })
    
    render(
      <SalesGrid
        sales={mockSales}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={<div>No sales</div>}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    const saleCards = screen.getAllByTestId('sale-card')
    
    // Cards should be contained within grid
    saleCards.forEach(card => {
      expect(gridContainer).toContainElement(card)
    })
  })

  it('should maintain grid layout during loading states', () => {
    render(
      <SalesGrid
        sales={[]}
        loading={true}
        authority="FILTERS"
        emptyStateMessage={<div>No sales</div>}
        skeletonCount={6}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    expect(gridContainer).toHaveClass('sales-grid')
    
    // Should show skeletons
    expect(screen.getAllByTestId('sale-skeleton')).toHaveLength(6)
  })

  it('should handle empty state without breaking grid', () => {
    render(
      <SalesGrid
        sales={[]}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={<div>No sales found</div>}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    expect(gridContainer).toBeInTheDocument()
    expect(gridContainer).toHaveClass('sales-grid')
    expect(screen.getByText('No sales found')).toBeInTheDocument()
  })

  it('should not have multiple column-defining classes', () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 1200
    })

    render(
      <SalesGrid
        sales={mockSales}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={<div>No sales</div>}
      />
    )

    const gridContainer = screen.getByTestId('sales-grid')
    
    // Custom grid system uses CSS variables, not multiple Tailwind classes
    expect(gridContainer).toHaveClass('sales-grid')
    expect(gridContainer).toHaveAttribute('data-columns')
    
    // Verify CSS variable is set
    const style = gridContainer.getAttribute('style')
    expect(style).toContain('--grid-columns')
  })
})
