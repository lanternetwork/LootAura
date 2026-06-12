import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import SocialReportMap from '@/app/admin/social/SocialReportMap'

const simpleMapMock = vi.fn((_props: unknown) => <div data-testid="simple-map-mock" />)

vi.mock('@/components/location/SimpleMap', () => ({
  default: (props: unknown) => simpleMapMock(props),
}))

vi.mock('next/dynamic', () => ({
  default: () => require('../../../../components/location/SimpleMap').default,
}))

const baseViewport = {
  centerLat: 30.27,
  centerLng: -97.74,
  zoom: 10,
}

const basePin = {
  id: 'sale-1',
  lat: 30.27,
  lng: -97.74,
  title: 'Weekend yard sale',
  is_featured: false,
}

describe('SocialReportMap', () => {
  beforeEach(() => {
    simpleMapMock.mockClear()
  })

  it('passes preserveDrawingBuffer true for social report capture', () => {
    render(
      <SocialReportMap
        mapPins={[basePin]}
        mapViewport={baseViewport}
      />
    )

    expect(simpleMapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveDrawingBuffer: true,
        interactive: false,
        attributionControl: false,
        showOSMAttribution: false,
      })
    )
  })

  it('forwards onMapIdle to SimpleMap', () => {
    const onMapIdle = vi.fn()
    render(
      <SocialReportMap
        mapPins={[basePin]}
        mapViewport={baseViewport}
        onMapIdle={onMapIdle}
      />
    )

    expect(simpleMapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onMapIdle,
      })
    )
  })
})
