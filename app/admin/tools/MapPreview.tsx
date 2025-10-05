'use client'

import React from 'react'
import Map, { NavigationControl } from 'react-map-gl'

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 }

export default function MapPreview() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const [errored, setErrored] = React.useState(false)

  if (!token) {
    return (
      <div className="rounded border bg-neutral-50 p-3 text-sm text-neutral-700">
        <div className="mb-1">Mapbox token missing. Set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code>.</div>
        <a className="text-blue-600 underline" href="/README" onClick={(e) => { e.preventDefault(); window.open('https://github.com/lanternetwork/LootAura#environment-variables', '_blank') }}>See token setup in README</a>
      </div>
    )
  }

  if (errored) {
    return (
      <div className="rounded border bg-neutral-50 p-3 text-sm text-neutral-700">
        <div className="mb-1">Map failed to render (likely invalid token). Fallback shown.</div>
        <a className="text-blue-600 underline" href="/README" onClick={(e) => { e.preventDefault(); window.open('https://github.com/lanternetwork/LootAura#environment-variables', '_blank') }}>See token setup in README</a>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded border" style={{ height: 220 }}>
      <Map
        initialViewState={{ latitude: DEFAULT_CENTER.lat, longitude: DEFAULT_CENTER.lng, zoom: 3 }}
        mapboxAccessToken={token}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onError={() => setErrored(true)}
      >
        <div style={{ position: 'absolute', right: 8, top: 8 }}>
          <NavigationControl showCompass={false} visualizePitch={false} />
        </div>
      </Map>
    </div>
  )
}


