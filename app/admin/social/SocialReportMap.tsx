'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type {
  SocialCityReportMapPin,
  SocialCityReportMapViewport,
} from '@/lib/admin/social/socialCityReportTypes'

const SimpleMap = dynamic(() => import('@/components/location/SimpleMap'), { ssr: false })

function mapPinsToPinPoints(pins: SocialCityReportMapPin[]) {
  return pins.map((pin) => ({
    id: pin.id,
    lat: pin.lat,
    lng: pin.lng,
    is_featured: pin.is_featured,
  }))
}

type SocialReportMapProps = {
  mapPins: SocialCityReportMapPin[]
  mapViewport: SocialCityReportMapViewport
  className?: string
}

/** Fixed viewport map — one pin per sale, no clustering (WYSIWYG with activeSales). */
export default function SocialReportMap({
  mapPins,
  mapViewport,
  className,
}: SocialReportMapProps) {
  const center = useMemo(
    () => ({ lat: mapViewport.centerLat, lng: mapViewport.centerLng }),
    [mapViewport.centerLat, mapViewport.centerLng]
  )
  const pinPoints = useMemo(() => mapPinsToPinPoints(mapPins), [mapPins])
  const pinsProp = useMemo(() => ({ sales: pinPoints }), [pinPoints])

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
        pins={pinsProp}
      />
    </div>
  )
}
