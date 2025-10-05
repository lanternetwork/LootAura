'use client'

import React from 'react'
import Map, { NavigationControl, Marker } from 'react-map-gl'

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 }

export default function MapPreview() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const [errored, setErrored] = React.useState(false)
  const [sales, setSales] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    // Fetch a few sample sales to show on the map
    fetch('/api/sales?lat=39.8283&lng=-98.5795&distanceKm=1000&limit=10')
      .then(res => res.json())
      .then(data => {
        if (data?.ok && data?.data) {
          setSales(data.data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
    <div className="space-y-2">
      <div className="text-sm text-neutral-700">
        {loading ? 'Loading sales...' : `Showing ${sales.length} sales`}
      </div>
      <div className="overflow-hidden rounded border" style={{ height: 220 }}>
        <Map
          initialViewState={{ latitude: DEFAULT_CENTER.lat, longitude: DEFAULT_CENTER.lng, zoom: 3 }}
          mapboxAccessToken={token}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          onError={() => setErrored(true)}
        >
          {sales.map((sale) => (
            <Marker
              key={sale.id}
              latitude={Number(sale.lat)}
              longitude={Number(sale.lng)}
            >
              <div className="w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg cursor-pointer" 
                   title={sale.title} />
            </Marker>
          ))}
          <div style={{ position: 'absolute', right: 8, top: 8 }}>
            <NavigationControl showCompass={false} visualizePitch={false} />
          </div>
        </Map>
      </div>
    </div>
  )
}


