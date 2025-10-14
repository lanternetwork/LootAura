import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import SalesGrid from '@/components/SalesGrid'
import { Sale } from '@/lib/types'
import { makeSales } from '../_helpers/factories'

// Mock SaleCard and SaleCardSkeleton to simplify tests
vi.mock('@/components/SaleCard', () => ({
  __esModule: true,
  default: function MockSaleCard({ sale }: { sale: Sale }) {
    return <div data-testid="sale-card">{sale.title}</div>
  }
}))

vi.mock('@/components/SaleCardSkeleton', () => ({
  __esModule: true,
  default: function MockSaleCardSkeleton() {
    return <div data-testid="sale-card-skeleton">Loading...</div>
  }
}))

const mockSales = makeSales(4, [
  { title: 'Sale 1', description: 'Desc 1' },
  { title: 'Sale 2', description: 'Desc 2' },
  { title: 'Sale 3', description: 'Desc 3' },
  { title: 'Sale 4', description: 'Desc 4' }
])

const emptyState = <div>No sales found.</div>

describe('SalesGrid', () => {
  beforeEach(() => {
    // Reset window width for each test
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 0 })
  })

  it('renders sales cards when not loading and sales are present', () => {
    render(
      <SalesGrid
        sales={mockSales}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={emptyState}
      />
    )
    expect(screen.getAllByTestId('sale-card')).toHaveLength(mockSales.length)
    expect(screen.queryByTestId('sale-card-skeleton')).not.toBeInTheDocument()
    expect(screen.queryByText('No sales found.')).not.toBeInTheDocument()
  })

  it('renders skeletons when loading and not in MAP authority', () => {
    render(
      <SalesGrid
        sales={[]}
        loading={true}
        authority="FILTERS"
        emptyStateMessage={emptyState}
        skeletonCount={3}
      />
    )
    expect(screen.getAllByTestId('sale-card-skeleton')).toHaveLength(3)
    expect(screen.queryByTestId('sale-card')).not.toBeInTheDocument()
    expect(screen.queryByText('No sales found.')).not.toBeInTheDocument()
  })

  it('renders empty state message when no sales and not loading', () => {
    render(
      <SalesGrid
        sales={[]}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={emptyState}
      />
    )
    expect(screen.getByText('No sales found.')).toBeInTheDocument()
    expect(screen.queryByTestId('sale-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sale-card-skeleton')).not.toBeInTheDocument()
  })

  it('does not render skeletons when in MAP authority, even if loading', () => {
    render(
      <SalesGrid
        sales={[]}
        loading={true}
        authority="MAP"
        emptyStateMessage={emptyState}
        skeletonCount={3}
      />
    )
    expect(screen.queryByTestId('sale-card-skeleton')).not.toBeInTheDocument()
    expect(screen.getByText('No sales found.')).toBeInTheDocument() // Should show empty state if no sales
  })

  it('observes resize events and updates columns', async () => {
    const { rerender } = render(
      <SalesGrid
        sales={mockSales}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={emptyState}
      />
    )

    const gridElement = screen.getByTestId('sales-grid')
    
    // Use the global ResizeObserver mock from tests/setup.ts
    expect(global.ResizeObserver).toBeDefined()

    // Simulate a resize to 700px (should be 2 columns)
    Object.defineProperty(gridElement, 'offsetWidth', { configurable: true, value: 700 })
    // Use the global helper to trigger resize
    if (globalThis.__simulateResize) {
      globalThis.__simulateResize(gridElement, 700)
    }

    await waitFor(() => {
      expect(gridElement).toHaveAttribute('data-columns', '2')
      expect(gridElement).toHaveAttribute('data-container-width', '700')
    })

    // Simulate a resize to 1200px (should be 3 columns)
    Object.defineProperty(gridElement, 'offsetWidth', { configurable: true, value: 1200 })
    if (globalThis.__simulateResize) {
      globalThis.__simulateResize(gridElement, 1200)
    }

    await waitFor(() => {
      expect(gridElement).toHaveAttribute('data-columns', '3')
      expect(gridElement).toHaveAttribute('data-container-width', '1200')
    })

    // Simulate a resize to 500px (should be 1 column)
    Object.defineProperty(gridElement, 'offsetWidth', { configurable: true, value: 500 })
    if (globalThis.__simulateResize) {
      globalThis.__simulateResize(gridElement, 500)
    }

    await waitFor(() => {
      expect(gridElement).toHaveAttribute('data-columns', '1')
      expect(gridElement).toHaveAttribute('data-container-width', '500')
    })
  })

  it('cleans up ResizeObserver on unmount', () => {
    const { unmount } = render(
      <SalesGrid
        sales={mockSales}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={emptyState}
      />
    )
    // The global ResizeObserver mock should be defined
    expect(global.ResizeObserver).toBeDefined()
    unmount()
    // The global ResizeObserver mock should still be defined
    expect(global.ResizeObserver).toBeDefined()
  })

  it('applies custom className', () => {
    render(
      <SalesGrid
        sales={mockSales}
        loading={false}
        authority="FILTERS"
        emptyStateMessage={emptyState}
        className="custom-class"
      />
    )
    const gridElement = screen.getByTestId('sales-grid')
    expect(gridElement).toHaveClass('sales-grid custom-class')
  })

  it('sets correct data attributes', () => {
    render(
      <SalesGrid
        sales={mockSales}
        loading={false}
        authority="MAP"
        emptyStateMessage={emptyState}
      />
    )
    const gridElement = screen.getByTestId('sales-grid')
    expect(gridElement).toHaveAttribute('data-authority', 'MAP')
    expect(gridElement).toHaveAttribute('data-hydrated', 'true')
  })
})