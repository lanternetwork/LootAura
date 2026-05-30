import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SimpleMap from '@/components/location/SimpleMap'

vi.mock('react-map-gl', () => {
  const React = require('react') as typeof import('react')
  return {
    default: React.forwardRef(function MockMap({ children }: { children?: React.ReactNode }, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => ({
        getMap: () => ({
          getZoom: () => 10,
          flyTo: vi.fn(),
          resize: vi.fn(),
          isStyleLoaded: () => true,
          getBounds: () => ({
            getWest: () => -86,
            getSouth: () => 37,
            getEast: () => -85,
            getNorth: () => 39,
          }),
          getCenter: () => ({ lat: 38.25, lng: -85.75 }),
          on: vi.fn(),
          once: (_e: string, cb?: () => void) => cb?.(),
          off: vi.fn(),
        }),
      }))
      return <div data-testid="mock-map">{children}</div>
    }),
    Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Marker: ({
      children,
      longitude,
      latitude,
    }: {
      children?: React.ReactNode
      longitude: number
      latitude: number
    }) => (
      <div data-testid="user-location-marker-wrapper" data-lng={longitude} data-lat={latitude}>
        {children}
      </div>
    ),
  }
})

vi.mock('@/lib/maps/token', () => ({
  getMapboxToken: () => 'pk.test-token',
}))

vi.mock('@/components/location/PinsOverlay', () => ({ default: () => null }))
vi.mock('@/components/location/HybridPinsOverlay', () => ({ default: () => null }))
vi.mock('@/components/location/AttributionOSM', () => ({ default: () => null }))

describe('SimpleMap user location marker (Phase 1)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'pk.test-token')
  })

  it('shows user location marker when lastUserLocation is set', () => {
    render(
      <SimpleMap
        center={{ lat: 39, lng: -98 }}
        zoom={10}
        lastUserLocation={{ lat: 38.25, lng: -85.75 }}
      />
    )

    expect(screen.getByRole('img', { name: 'Your location' })).toBeInTheDocument()
    const wrapper = screen.getByTestId('user-location-marker-wrapper')
    expect(wrapper).toHaveAttribute('data-lng', '-85.75')
    expect(wrapper).toHaveAttribute('data-lat', '38.25')
  })

  it('hides user location marker when lastUserLocation is null', () => {
    render(
      <SimpleMap center={{ lat: 39, lng: -98 }} zoom={10} lastUserLocation={null} />
    )

    expect(screen.queryByRole('img', { name: 'Your location' })).not.toBeInTheDocument()
  })
})
