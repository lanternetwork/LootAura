import type { Ref } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import SimpleMap from '@/components/location/SimpleMap'

let lastMapProps: Record<string, unknown> = {}

vi.mock('react-map-gl', () => {
  const React = require('react') as typeof import('react')
  return {
    default: React.forwardRef(function MockMap(
      props: Record<string, unknown>,
      ref: Ref<unknown>
    ) {
      lastMapProps = props
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
      return <div data-testid="mock-map" />
    }),
    Popup: () => null,
  }
})

vi.mock('@/lib/maps/token', () => ({
  getMapboxToken: () => 'pk.test-token',
}))

vi.mock('@/components/location/PinsOverlay', () => ({ default: () => null }))
vi.mock('@/components/location/HybridPinsOverlay', () => ({ default: () => null }))
vi.mock('@/components/location/AttributionOSM', () => ({ default: () => null }))

describe('SimpleMap onMapClick dismiss', () => {
  beforeEach(() => {
    lastMapProps = {}
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'pk.test-token')
  })

  it('invokes onMapClick for bare map canvas clicks', () => {
    const onMapClick = vi.fn()
    render(<SimpleMap center={{ lat: 39, lng: -98 }} zoom={10} onMapClick={onMapClick} />)

    const canvas = document.createElement('canvas')
    const handleMapClick = lastMapProps.onClick as (e: { originalEvent: { target: HTMLElement } }) => void
    handleMapClick({ originalEvent: { target: canvas } })

    expect(onMapClick).toHaveBeenCalledTimes(1)
  })

  it('does not invoke onMapClick when click originates inside mobile sale callout', () => {
    const onMapClick = vi.fn()
    render(<SimpleMap center={{ lat: 39, lng: -98 }} zoom={10} onMapClick={onMapClick} />)

    const callout = document.createElement('div')
    callout.setAttribute('data-mobile-sale-callout', 'true')
    const inner = document.createElement('button')
    callout.appendChild(inner)

    const handleMapClick = lastMapProps.onClick as (e: { originalEvent: { target: HTMLElement } }) => void
    handleMapClick({ originalEvent: { target: inner } })

    expect(onMapClick).not.toHaveBeenCalled()
  })
})
