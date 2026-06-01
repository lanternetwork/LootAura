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

const viewport = { center: { lat: 38.25, lng: -85.75 }, zoom: 11 }

describe('SaleCard marketplace distance (Workstream B)', () => {
  it('shows distance from sale.distance_m when present', () => {
    const sale = makeSale({
      id: 'sale-nearby',
      lat: 38.26,
      lng: -85.76,
      distance_m: 804,
    })

    render(<SaleCard sale={sale} viewport={viewport} />)

    expect(screen.getByTestId('sale-card-distance-from-user')).toHaveTextContent('0.5 mi away')
  })

  it('falls back to viewport center when distance_m is absent', () => {
    const sale = makeSale({
      id: 'sale-viewport-fallback',
      lat: 38.26,
      lng: -85.76,
    })

    render(<SaleCard sale={sale} viewport={viewport} />)

    expect(screen.getByTestId('sale-card-distance-from-user')).toBeInTheDocument()
  })

  it('hides distance when viewport and distance_m are unavailable', () => {
    const sale = makeSale({ id: 'sale-no-ref', lat: 38.26, lng: -85.76 })

    render(<SaleCard sale={sale} />)

    expect(screen.queryByTestId('sale-card-distance-from-user')).not.toBeInTheDocument()
  })

  it('hides distance when sale coordinates are invalid and distance_m absent', () => {
    const sale = makeSale({ id: 'sale-no-coords', lat: undefined, lng: undefined })

    render(<SaleCard sale={sale} viewport={viewport} />)

    expect(screen.queryByTestId('sale-card-distance-from-user')).not.toBeInTheDocument()
  })
})
