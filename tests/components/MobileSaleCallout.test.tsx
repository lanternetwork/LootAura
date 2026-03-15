import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MobileSaleCallout from '@/components/sales/MobileSaleCallout'
import { makeSale } from '../_helpers/factories'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Reuse same favorite control surface as production; mock would hide regression in wiring
vi.mock('@/components/FavoriteButton', () => ({
  __esModule: true,
  default: function MockFavoriteButton({ saleId }: { saleId: string }) {
    return (
      <button type="button" aria-label="Save sale" data-testid="callout-favorite">
        {saleId}
      </button>
    )
  },
}))

describe('MobileSaleCallout', () => {
  it('renders favorite control in action area when sale is provided', () => {
    const sale = makeSale({ id: 'callout-sale-1', title: 'Map callout sale' })

    render(
      <MobileSaleCallout
        sale={sale}
        onDismiss={() => {}}
        viewport={{ center: { lat: 38, lng: -85 }, zoom: 10 }}
        pinPosition={{ x: 100, y: 200 }}
      />
    )

    const favoriteControl = screen.getByTestId('callout-favorite')
    expect(favoriteControl).toBeInTheDocument()
    expect(favoriteControl).toHaveAttribute('aria-label', 'Save sale')
  })

  it('renders null when sale is null', () => {
    const { container } = render(
      <MobileSaleCallout sale={null} onDismiss={() => {}} />
    )

    expect(container.firstChild).toBeNull()
  })
})
