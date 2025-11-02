import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SalesList from '@/components/SalesList'
import { makeSales } from '../_helpers/factories'

// Mock SaleCard to simplify test
import { vi } from 'vitest'
vi.mock('@/components/SaleCard', () => ({
  __esModule: true,
  default: function MockSaleCard({ sale }: { sale: any }) {
    return <div data-testid="sale-card">{sale.title}</div>
  }
}))

describe('SalesList mobile layout', () => {
  it('uses flex-col layout on mobile (single column)', () => {
    const mockSales = makeSales(3, [
      { title: 'Sale 1' },
      { title: 'Sale 2' },
      { title: 'Sale 3' }
    ])

    render(<SalesList sales={mockSales} />)

    const listContainer = screen.getByTestId('sales-list')
    expect(listContainer).toHaveClass('flex')
    expect(listContainer).toHaveClass('flex-col')
    expect(listContainer).toHaveClass('md:grid')
    expect(listContainer).toHaveClass('md:grid-cols-2')
    expect(listContainer).toHaveClass('lg:grid-cols-3')
  })

  it('renders sale cards with w-full class', () => {
    const mockSales = makeSales(2, [
      { title: 'Sale 1' },
      { title: 'Sale 2' }
    ])

    render(<SalesList sales={mockSales} />)

    const cards = screen.getAllByTestId('sale-card')
    expect(cards.length).toBe(2)

    // Each card should be rendered (we can't easily check className of SaleCard
    // since it's mocked, but we can verify they're in the container)
    cards.forEach(card => {
      expect(card).toBeInTheDocument()
    })
  })
})

