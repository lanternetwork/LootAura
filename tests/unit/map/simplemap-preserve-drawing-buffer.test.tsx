import type { Ref } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import SimpleMap from '@/components/location/SimpleMap'

let lastMapProps: Record<string, unknown> = {}

vi.mock('react-map-gl', () => {
  const React = require('react') as typeof import('react')
  return {
    default: React.forwardRef(function MockMap(
      props: Record<string, unknown> & { onLoad?: () => void },
      ref: Ref<unknown>
    ) {
      lastMapProps = props
      React.useEffect(() => {
        props.onLoad?.()
      }, [])
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

describe('SimpleMap preserveDrawingBuffer', () => {
  beforeEach(() => {
    lastMapProps = {}
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'pk.test-token')
  })

  it('defaults preserveDrawingBuffer to false', () => {
    render(<SimpleMap center={{ lat: 39, lng: -98 }} zoom={10} />)
    expect(lastMapProps.preserveDrawingBuffer).toBe(false)
  })

  it('passes preserveDrawingBuffer when enabled', () => {
    render(
      <SimpleMap center={{ lat: 39, lng: -98 }} zoom={10} preserveDrawingBuffer={true} />
    )
    expect(lastMapProps.preserveDrawingBuffer).toBe(true)
  })

  it('invokes onMapIdle after first map idle', async () => {
    const onMapIdle = vi.fn()
    render(
      <SimpleMap center={{ lat: 39, lng: -98 }} zoom={10} onMapIdle={onMapIdle} />
    )
    await waitFor(() => {
      expect(onMapIdle).toHaveBeenCalledTimes(1)
    })
  })
})
