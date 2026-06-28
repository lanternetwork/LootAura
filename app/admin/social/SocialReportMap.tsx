'use client'

import MetroMapSnapshot from '@/components/metro/MetroMapSnapshot'
import type {
  SocialCityReportMapPin,
  SocialCityReportMapViewport,
} from '@/lib/admin/social/socialCityReportTypes'

type SocialReportMapProps = {
  mapPins: SocialCityReportMapPin[]
  mapViewport: SocialCityReportMapViewport
  className?: string
  onMapIdle?: () => void
}

/** Fixed viewport map — one pin per sale, no clustering (WYSIWYG with activeSales). */
export default function SocialReportMap({
  mapPins,
  mapViewport,
  className,
  onMapIdle,
}: SocialReportMapProps) {
  return (
    <MetroMapSnapshot
      pins={mapPins.map((pin) => ({
        id: pin.id,
        lat: pin.lat,
        lng: pin.lng,
        is_featured: pin.is_featured,
      }))}
      viewport={mapViewport}
      className={className ?? 'h-64 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100'}
      preserveDrawingBuffer
      onMapIdle={onMapIdle}
    />
  )
}
