import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const { MockSimpleMap, simpleMapMock } = vi.hoisted(() => {
  const simpleMapMock = vi.fn((_props: unknown) => <div data-testid="simple-map-mock" />)
  function MockSimpleMap(props: unknown) {
    return simpleMapMock(props)
  }
  return { MockSimpleMap, simpleMapMock }
})

vi.mock('next/dynamic', () => ({
  default: () => MockSimpleMap,
}))

import MetroMapSnapshot from '@/components/metro/MetroMapSnapshot'

const baseViewport = {
  centerLat: 30.27,
  centerLng: -97.74,
  zoom: 10,
}

describe('MetroMapSnapshot', () => {
  beforeEach(() => {
    simpleMapMock.mockClear()
  })

  it('renders non-interactive map with snapshot pins', () => {
    render(
      <MetroMapSnapshot
        pins={[{ id: 'sale-1', lat: 30.27, lng: -97.74 }]}
        viewport={baseViewport}
      />
    )

    expect(simpleMapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        interactive: false,
        attributionControl: false,
        showOSMAttribution: false,
        preserveDrawingBuffer: false,
      })
    )
  })

  it('supports preserveDrawingBuffer for social capture', () => {
    render(
      <MetroMapSnapshot
        pins={[{ id: 'sale-1', lat: 30.27, lng: -97.74 }]}
        viewport={baseViewport}
        preserveDrawingBuffer
      />
    )

    expect(simpleMapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveDrawingBuffer: true,
      })
    )
  })
})
