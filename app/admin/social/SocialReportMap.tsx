'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type {
  SocialCityReportMapPin,
  SocialCityReportMapViewport,
} from '@/lib/admin/social/socialCityReportTypes'
import type { Sale } from '@/lib/types'

const SimpleMap = dynamic(() => import('@/components/location/SimpleMap'), { ssr: false })

type Viewport = {
  bounds: [number, number, number, number]
  zoom: number
}

function pinsToSales(pins: SocialCityReportMapPin[]): Sale[] {
  return pins.map((pin) => ({
    id: pin.id,
    owner_id: '',
    title: pin.title,
    city: '',
    state: '',
    date_start: '',
    time_start: '',
    lat: pin.lat,
    lng: pin.lng,
    status: 'published',
    privacy_mode: 'exact',
    is_featured: pin.is_featured,
    created_at: '',
    updated_at: '',
  }))
}

const DEFAULT_VIEWPORT: Viewport = {
  bounds: [-125, 24, -66, 50],
  zoom: 4,
}

type SocialReportMapProps = {
  mapPins: SocialCityReportMapPin[]
  mapViewport: SocialCityReportMapViewport
  className?: string
}

export default function SocialReportMap({
  mapPins,
  mapViewport,
  className,
}: SocialReportMapProps) {
  const [viewport, setViewport] = useState<Viewport | null>(null)

  const center = useMemo(
    () => ({ lat: mapViewport.centerLat, lng: mapViewport.centerLng }),
    [mapViewport.centerLat, mapViewport.centerLng]
  )
  const sales = useMemo(() => pinsToSales(mapPins), [mapPins])
  const resolvedViewport = viewport ?? DEFAULT_VIEWPORT

  const containerClass =
    className ?? 'h-64 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100'

  return (
    <div className={containerClass}>
      <SimpleMap
        center={center}
        zoom={mapViewport.zoom}
        interactive={false}
        attributionControl={false}
        showOSMAttribution={true}
        attributionPosition="bottom-right"
        hybridPins={{
          sales,
          selectedId: null,
          onLocationClick: () => {},
          onClusterClick: () => {},
          viewport: resolvedViewport,
        }}
        onViewportChange={({ bounds, zoom }) => {
          setViewport({
            bounds: [bounds.west, bounds.south, bounds.east, bounds.north],
            zoom,
          })
        }}
      />
    </div>
  )
}
