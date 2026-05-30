import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SaleCard from '@/components/SaleCard'
import { makeSale } from '../../_helpers/factories'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/FavoriteButton', () => ({
  default: () => null,
}))

describe('SaleCard user distance (Phase 3)', () => {
  it('shows distance from user when coordinates are valid', () => {
    const sale = makeSale({
      id: 'sale-nearby',
      lat: 38.26,
      lng: -85.76,
    })

    render(
      <SaleCard
        sale={sale}
        userLocation={{ lat: 38.25, lng: -85.75 }}
      />
    )

    expect(screen.getByTestId('sale-card-distance-from-user')).toBeInTheDocument()
  })

  it('hides distance when user location is unavailable', () => {
    const sale = makeSale({ id: 'sale-no-user', lat: 38.26, lng: -85.76 })

    render(<SaleCard sale={sale} userLocation={null} />)

    expect(screen.queryByTestId('sale-card-distance-from-user')).not.toBeInTheDocument()
  })

  it('hides distance when sale coordinates are invalid', () => {
    const sale = makeSale({ id: 'sale-no-coords', lat: undefined, lng: undefined })

    render(
      <SaleCard
        sale={sale}
        userLocation={{ lat: 38.25, lng: -85.75 }}
      />
    )

    expect(screen.queryByTestId('sale-card-distance-from-user')).not.toBeInTheDocument()
  })
})
