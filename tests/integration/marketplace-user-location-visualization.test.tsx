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

describe('Marketplace user location visualization (integration)', () => {
  const userLocation = { lat: 38.25, lng: -85.75 }

  it('SalesList shows user-relative distance on cards when userLocation is set', () => {
    const sale = makeSale({
      id: 'integration-sale-1',
      title: 'Integration test sale',
      lat: 38.26,
      lng: -85.76,
    })

    renderWithProviders(
      <SalesList sales={[sale]} userLocation={userLocation} />
    )

    expect(screen.getByTestId('sale-card-distance-from-user')).toBeInTheDocument()
  })

  it('SalesList hides distance when userLocation is unavailable', () => {
    const sale = makeSale({
      id: 'integration-sale-2',
      lat: 38.26,
      lng: -85.76,
    })

    renderWithProviders(<SalesList sales={[sale]} userLocation={null} />)

    expect(screen.queryByTestId('sale-card-distance-from-user')).not.toBeInTheDocument()
  })

  it('MobileSaleCallout shows user-relative distance when userLocation is set', () => {
    const sale = makeSale({
      id: 'integration-callout-1',
      title: 'Callout integration sale',
      lat: 38.26,
      lng: -85.76,
    })

    renderWithProviders(
      <MobileSaleCallout
        sale={sale}
        onDismiss={() => {}}
        viewport={{ center: { lat: 38.25, lng: -85.75 }, zoom: 11 }}
        pinPosition={{ x: 120, y: 240 }}
        userLocation={userLocation}
      />
    )

    expect(screen.getByTestId('callout-distance-from-user')).toBeInTheDocument()
  })
})
