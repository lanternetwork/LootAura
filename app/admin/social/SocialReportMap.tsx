'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { SocialCityReportMapPin } from '@/lib/admin/social/socialCityReportTypes'
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

function boundsFromPins(pins: SocialCityReportMapPin[]): {
  west: number
  south: number
  east: number
  north: number
} | null {
  if (pins.length === 0) return null
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const pin of pins) {
    west = Math.min(west, pin.lng)
    east = Math.max(east, pin.lng)
    south = Math.min(south, pin.lat)
    north = Math.max(north, pin.lat)
  }
  return { west, south, east, north }
}

function centerFromBounds(bounds: { west: number; south: number; east: number; north: number }) {
  return {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  }
}

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 }
const DEFAULT_VIEWPORT: Viewport = {
  bounds: [-125, 24, -66, 50],
  zoom: 4,
}

type SocialReportMapProps = {
  mapPins: SocialCityReportMapPin[]
  className?: string
}

export default function SocialReportMap({ mapPins, className }: SocialReportMapProps) {
  const [viewport, setViewport] = useState<Viewport | null>(null)

  const fitBounds = useMemo(() => boundsFromPins(mapPins), [mapPins])
  const center = useMemo(
    () => (fitBounds ? centerFromBounds(fitBounds) : DEFAULT_CENTER),
    [fitBounds]
  )
  const sales = useMemo(() => pinsToSales(mapPins), [mapPins])
  const resolvedViewport = viewport ?? DEFAULT_VIEWPORT

  const containerClass =
    className ?? 'h-64 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100'

  return (
    <div className={containerClass}>
      <SimpleMap
        center={center}
        zoom={fitBounds ? undefined : 10}
        fitBounds={fitBounds}
        fitBoundsOptions={{ padding: 40, duration: 0, maxZoom: 13 }}
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
