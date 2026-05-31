import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../utils/renderWithProviders'
import SalesList from '@/components/SalesList'
import MobileSaleCallout from '@/components/sales/MobileSaleCallout'
import { makeSale } from '../_helpers/factories'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/FavoriteButton', () => ({
  default: () => null,
}))

describe('Marketplace distance visualization (integration)', () => {
  const viewport = { center: { lat: 38.25, lng: -85.75 }, zoom: 11 }

  it('SalesList shows viewport-aligned distance when sale.distance_m is set', () => {
    const sale = makeSale({
      id: 'integration-sale-1',
      title: 'Integration test sale',
      lat: 38.26,
      lng: -85.76,
      distance_m: 1609,
    })

    renderWithProviders(<SalesList sales={[sale]} viewport={viewport} />)

    expect(screen.getByTestId('sale-card-distance-from-user')).toHaveTextContent('1.0 mi away')
  })

  it('SalesList hides distance when viewport and distance_m are unavailable', () => {
    const sale = makeSale({
      id: 'integration-sale-2',
      lat: 38.26,
      lng: -85.76,
    })

    renderWithProviders(<SalesList sales={[sale]} />)

    expect(screen.queryByTestId('sale-card-distance-from-user')).not.toBeInTheDocument()
  })

  it('MobileSaleCallout shows viewport-aligned distance from sale.distance_m', () => {
    const sale = makeSale({
      id: 'integration-callout-1',
      title: 'Callout integration sale',
      lat: 38.26,
      lng: -85.76,
      distance_m: 804,
    })

    renderWithProviders(
      <MobileSaleCallout
        sale={sale}
        onDismiss={() => {}}
        viewport={viewport}
        pinPosition={{ x: 120, y: 240 }}
      />
    )

    expect(screen.getByTestId('callout-distance-from-user')).toHaveTextContent('0.5 mi away')
  })
})
