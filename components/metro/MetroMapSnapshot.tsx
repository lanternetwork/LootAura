'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { MetroMapPin, MetroMapViewport } from '@/lib/seo/metroMapViewport'

const SimpleMap = dynamic(() => import('@/components/location/SimpleMap'), { ssr: false })

type MetroMapSnapshotProps = {
  pins: MetroMapPin[]
  viewport: MetroMapViewport
  className?: string
  preserveDrawingBuffer?: boolean
  onMapIdle?: () => void
}

/** Non-interactive fixed-viewport map for SEO metro pages and social reports. */
export default function MetroMapSnapshot({
  pins,
  viewport,
  className,
  preserveDrawingBuffer = false,
  onMapIdle,
}: MetroMapSnapshotProps) {
  const center = useMemo(
    () => ({ lat: viewport.centerLat, lng: viewport.centerLng }),
    [viewport.centerLat, viewport.centerLng]
  )
  const pinPoints = useMemo(
    () =>
      pins.map((pin) => ({
        id: pin.id,
        lat: pin.lat,
        lng: pin.lng,
        is_featured: pin.is_featured ?? false,
      })),
    [pins]
  )
  const pinsProp = useMemo(() => ({ sales: pinPoints }), [pinPoints])

  const containerClass =
    className ?? 'h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100'

  return (
    <div className={containerClass}>
      <SimpleMap
        center={center}
        zoom={viewport.zoom}
        interactive={false}
        attributionControl={false}
        showOSMAttribution={false}
        pins={pinsProp}
        preserveDrawingBuffer={preserveDrawingBuffer}
        onMapIdle={onMapIdle}
      />
    </div>
  )
}
