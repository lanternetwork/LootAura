'use client'

import React from 'react'
import Map, { NavigationControl, Marker } from 'react-map-gl'

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 }

export default function MapPreview() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const [errored, setErrored] = React.useState(false)
  const [sales, setSales] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [mapCenter, setMapCenter] = React.useState(DEFAULT_CENTER)

  React.useEffect(() => {
    // Fetch ALL sales for world view
    fetch('/api/admin/sales')
      .then(res => res.json())
      .then(data => {
        if (data?.ok && data?.data) {
          setSales(data.data)
          console.log('Sales data:', data.data.slice(0, 5)) // Log first 5 for debugging
          
          // If we have sales, center map on the first one
          if (data.data.length > 0) {
            const firstSale = data.data[0]
            setMapCenter({ lat: Number(firstSale.lat), lng: Number(firstSale.lng) })
          }
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
          initialViewState={{ latitude: mapCenter.lat, longitude: mapCenter.lng, zoom: 6 }}
          mapboxAccessToken={token}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          onError={() => setErrored(true)}
        >
          {sales.map((sale) => {
            const lat = Number(sale.lat)
            const lng = Number(sale.lng)
            console.log(`Sale ${sale.id}: lat=${lat}, lng=${lng}, title=${sale.title}`)
            return (
              <Marker
                key={sale.id}
                latitude={lat}
                longitude={lng}
              >
                <div 
                  className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg cursor-pointer hover:bg-red-600" 
                  title={`${sale.title} (${sale.city}, ${sale.state})`}
                  style={{ zIndex: 1000 }}
                />
              </Marker>
            )
          })}
          <div style={{ position: 'absolute', right: 8, top: 8 }}>
            <NavigationControl showCompass={false} visualizePitch={false} />
          </div>
        </Map>
      </div>
    </div>
  )
}


