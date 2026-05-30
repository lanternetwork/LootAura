import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import UserLocationMarker from '@/components/map/UserLocationMarker'
import { isValidUserMapCoordinate } from '@/lib/map/isValidUserMapCoordinate'

vi.mock('react-map-gl', () => ({
  Marker: ({
    children,
    longitude,
    latitude,
  }: {
    children: React.ReactNode
    longitude: number
    latitude: number
  }) => (
    <div
      data-testid="map-marker"
      data-longitude={longitude}
      data-latitude={latitude}
    >
      {children}
    </div>
  ),
}))

describe('isValidUserMapCoordinate', () => {
  it('accepts valid coordinates', () => {
    expect(isValidUserMapCoordinate(38.25, -85.75)).toBe(true)
  })

  it('rejects invalid coordinates', () => {
    expect(isValidUserMapCoordinate(91, 0)).toBe(false)
    expect(isValidUserMapCoordinate(0, 181)).toBe(false)
    expect(isValidUserMapCoordinate(NaN, 0)).toBe(false)
    expect(isValidUserMapCoordinate(0, 'x')).toBe(false)
  })
})

describe('UserLocationMarker', () => {
  it('renders marker with Mapbox lng/lat order and accessibility label', () => {
    render(<UserLocationMarker lat={38.25} lng={-85.75} />)

    const marker = screen.getByTestId('map-marker')
    expect(marker).toHaveAttribute('data-longitude', '-85.75')
    expect(marker).toHaveAttribute('data-latitude', '38.25')

    const indicator = screen.getByRole('img', { name: 'Your location' })
    expect(indicator).toHaveAttribute('data-testid', 'user-location-marker')
    expect(indicator).toHaveClass('pointer-events-none')
  })

  it('renders nothing for invalid coordinates', () => {
    const { container } = render(<UserLocationMarker lat={999} lng={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})
