'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { haversineMeters } from '@/lib/geo/distance'
import { googleAutocomplete, googlePlaceDetails, type GooglePrediction } from '@/lib/providers/googlePlaces'

// Dynamically import map to avoid SSR issues
const SimpleMap = dynamic(() => import('@/components/location/SimpleMap'), { ssr: false })

interface GeolocationResult {
  method: string
  lat: number
  lng: number
  accuracy?: number // meters
  source: string
  timestamp: number
  error?: string
  details?: any
}


export default function GeolocationDiagnostics() {
  const [results, setResults] = useState<GeolocationResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<any>(null)
  const [includeBrowserGeo, setIncludeBrowserGeo] = useState(false)
  const [googleQuery, setGoogleQuery] = useState('5001 pres')
  const [googlePredictions, setGooglePredictions] = useState<GooglePrediction[]>([])
  const [googleSession, setGoogleSession] = useState<string>('')

  // Color scheme for different methods
  const methodColors: Record<string, string> = {
    'Vercel IP Headers': '#3B82F6', // blue
    'IP API (ipapi.co)': '#10B981', // green
    'IP API (ip-api.com)': '#8B5CF6', // purple
    'IP API (ipinfo.io)': '#F59E0B', // amber
    'Browser (High Accuracy)': '#EF4444', // red
    'Browser (Low Accuracy)': '#EC4899', // pink
    'Cached Location': '#6B7280', // gray
  }

  const testAllMethods = async () => {
    setIsLoading(true)
    setError(null)
    const newResults: GeolocationResult[] = []
    const timestamp = Date.now()

    try {
      // 1. Test Vercel IP Headers
      try {
        const response = await fetch('/api/geolocation/ip')
        const data = await response.json()
        if (data.lat && data.lng) {
          newResults.push({
            method: 'Vercel IP Headers',
            lat: data.lat,
            lng: data.lng,
            source: data.source || 'vercel',
            timestamp,
            details: {
              city: data.city,
              country: data.country,
              state: data.state,
            },
          })
        }
      } catch (err: any) {
        newResults.push({
          method: 'Vercel IP Headers',
          lat: 0,
          lng: 0,
          source: 'error',
          timestamp,
          error: err.message || 'Failed to fetch',
        })
      }

      // 2. Test External IP APIs one by one
      const ipServices = [
        { name: 'ipapi.co', url: 'https://ipapi.co/json/' },
        { name: 'ip-api.com', url: 'http://ip-api.com/json/' },
        { name: 'ipinfo.io', url: 'https://ipinfo.io/json' },
      ]

      for (const service of ipServices) {
        try {
          const response = await fetch(service.url, {
            headers: { 'User-Agent': 'LootAura/1.0' },
          })
          if (!response.ok) continue

          const data = await response.json()
          let lat: number | null = null
          let lng: number | null = null
          let city: string | undefined
          let country: string | undefined
          let state: string | undefined

          if (service.name === 'ipapi.co') {
            lat = data.latitude
            lng = data.longitude
            city = data.city
            state = data.region
            country = data.country_name
          } else if (service.name === 'ip-api.com') {
            lat = data.lat
            lng = data.lon
            city = data.city
            state = data.region
            country = data.country
          } else if (service.name === 'ipinfo.io') {
            const loc = data.loc?.split(',')
            lat = loc?.[0] ? parseFloat(loc[0]) : null
            lng = loc?.[1] ? parseFloat(loc[1]) : null
            city = data.city
            state = data.region
            country = data.country
          }

          if (lat && lng) {
            newResults.push({
              method: `IP API (${service.name})`,
              lat,
              lng,
              source: service.name,
              timestamp,
              details: {
                city,
                country,
                state,
                ip: data.ip || data.query,
              },
            })
          }
        } catch (err: any) {
          newResults.push({
            method: `IP API (${service.name})`,
            lat: 0,
            lng: 0,
            source: 'error',
            timestamp,
            error: err.message || 'Failed to fetch',
          })
        }
      }

      // 3. Test Browser Geolocation (High Accuracy)
      if (includeBrowserGeo && 'geolocation' in navigator) {
        try {
          await new Promise<void>((resolve, _reject) => {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                newResults.push({
                  method: 'Browser (High Accuracy)',
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                  source: 'browser-gps',
                  timestamp,
                  details: {
                    altitude: position.coords.altitude,
                    altitudeAccuracy: position.coords.altitudeAccuracy,
                    heading: position.coords.heading,
                    speed: position.coords.speed,
                  },
                })
                resolve()
              },
              (error) => {
                newResults.push({
                  method: 'Browser (High Accuracy)',
                  lat: 0,
                  lng: 0,
                  source: 'error',
                  timestamp,
                  error: error.message || 'Geolocation denied or failed',
                })
                resolve() // Don't reject, just mark as error
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            )
          })
        } catch (err: any) {
          newResults.push({
            method: 'Browser (High Accuracy)',
            lat: 0,
            lng: 0,
            source: 'error',
            timestamp,
            error: err.message || 'Failed',
          })
        }

        // 4. Test Browser Geolocation (Low Accuracy)
        try {
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                newResults.push({
                  method: 'Browser (Low Accuracy)',
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                  source: 'browser-network',
                  timestamp,
                  details: {
                    altitude: position.coords.altitude,
                    altitudeAccuracy: position.coords.altitudeAccuracy,
                  },
                })
                resolve()
              },
              (error) => {
                newResults.push({
                  method: 'Browser (Low Accuracy)',
                  lat: 0,
                  lng: 0,
                  source: 'error',
                  timestamp,
                  error: error.message || 'Geolocation denied or failed',
                })
                resolve()
              },
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
            )
          })
        } catch (err: any) {
          newResults.push({
            method: 'Browser (Low Accuracy)',
            lat: 0,
            lng: 0,
            source: 'error',
            timestamp,
            error: err.message || 'Failed',
          })
        }
      } else if (includeBrowserGeo === false) {
        // Skipped browser geolocation by design; do nothing
      } else {
        newResults.push({
          method: 'Browser (High Accuracy)',
          lat: 0,
          lng: 0,
          source: 'error',
          timestamp,
          error: 'Geolocation not supported',
        })
        newResults.push({
          method: 'Browser (Low Accuracy)',
          lat: 0,
          lng: 0,
          source: 'error',
          timestamp,
          error: 'Geolocation not supported',
        })
      }

      // 5. Check for cached location
      try {
        const saved = localStorage.getItem('loot-aura:lastLocation')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.lat && parsed.lng) {
            newResults.push({
              method: 'Cached Location',
              lat: parsed.lat,
              lng: parsed.lng,
              source: 'localStorage',
              timestamp: parsed.timestamp || timestamp,
              details: {
                zip: parsed.zip,
                city: parsed.city,
              },
            })
          }
        }
      } catch (err) {
        // Ignore localStorage errors
      }

      setResults(newResults)
    } catch (err: any) {
      setError(err.message || 'Failed to test geolocation methods')
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate distances between all methods
  const calculateDistances = () => {
    const validResults = results.filter((r) => r.lat !== 0 && r.lng !== 0 && !r.error)
    if (validResults.length < 2) return []

    const distances: Array<{
      from: string
      to: string
      distanceM: number
      distanceKm: number
    }> = []

    for (let i = 0; i < validResults.length; i++) {
      for (let j = i + 1; j < validResults.length; j++) {
        const from = validResults[i]
        const to = validResults[j]
        const distanceM = haversineMeters(from.lat, from.lng, to.lat, to.lng)
        distances.push({
          from: from.method,
          to: to.method,
          distanceM: Math.round(distanceM),
          distanceKm: parseFloat((distanceM / 1000).toFixed(2)),
        })
      }
    }

    return distances.sort((a, b) => a.distanceM - b.distanceM)
  }

  // Generate map pins (formatted for SimpleMap)
  const generatePins = () => {
    const validResults = results.filter((r) => r.lat !== 0 && r.lng !== 0 && !r.error)
    return validResults.map((r, index) => ({
      id: `geo-marker-${index}`,
      lat: r.lat,
      lng: r.lng,
    }))
  }

  // Calculate center point for map (average of all valid locations)
  const calculateMapCenter = () => {
    const validResults = results.filter((r) => r.lat !== 0 && r.lng !== 0 && !r.error)
    if (validResults.length === 0) {
      return { lat: 38.2527, lng: -85.7585 } // Default to Louisville
    }

    const avgLat = validResults.reduce((sum, r) => sum + r.lat, 0) / validResults.length
    const avgLng = validResults.reduce((sum, r) => sum + r.lng, 0) / validResults.length
    return { lat: avgLat, lng: avgLng }
  }

  const distances = calculateDistances()
  const pins = generatePins()
  const mapCenter = calculateMapCenter()

  // Auto-run on mount
  useEffect(() => {
    testAllMethods()
    // initialize Google session token lazily
    try {
      // @ts-ignore
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        // @ts-ignore
        setGoogleSession(crypto.randomUUID())
      } else {
        setGoogleSession(Math.random().toString(36).slice(2) + Date.now().toString(36))
      }
    } catch {
      setGoogleSession(Math.random().toString(36).slice(2) + Date.now().toString(36))
    }
  }, [])

  async function runGoogleTest() {
    setError(null)
    setGooglePredictions([])
    // Use the first valid location as center or fallback to Louisville
    const center = (() => {
      const valid = results.find(r => !r.error && r.lat && r.lng)
      return valid ? { lat: valid.lat, lng: valid.lng } : { lat: 38.2527, lng: -85.7585 }
    })()
    try {
      const preds = await googleAutocomplete(googleQuery, center.lat, center.lng, googleSession)
      setGooglePredictions(preds)
      // Attempt details of first prediction and add to results/pins
      if (preds.length > 0) {
        const details = await googlePlaceDetails(preds[0].placeId, googleSession)
        if (details) {
          const entry: GeolocationResult = {
            method: 'Google Place Details',
            lat: details.lat,
            lng: details.lng,
            accuracy: undefined,
            source: 'google',
            timestamp: Date.now(),
            details: { label: details.label }
          }
          setResults(prev => [...prev, entry])
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Google request failed')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Geolocation Diagnostics</h3>
        <p className="text-sm text-gray-600 mb-4">
          Test all geolocation methods and compare their results. This helps identify accuracy issues
          and coordinate drift.
        </p>
        <button
          onClick={testAllMethods}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Testing...' : 'Run Tests'}
        </button>
        <label className="ml-3 inline-flex items-center text-sm">
          <input
            type="checkbox"
            checked={includeBrowserGeo}
            onChange={(e) => setIncludeBrowserGeo(e.target.checked)}
            className="mr-2"
          />
          Include browser geolocation (will prompt)
        </label>
        {/* Google test controls */}
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={googleQuery}
            onChange={(e) => setGoogleQuery(e.target.value)}
            placeholder="Google test query (e.g. 5001 pres)"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <button
            onClick={runGoogleTest}
            className="px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
          >
            Test Google
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Map Display */}
      {pins.length > 0 && (
        <div className="mb-6">
          <h4 className="text-md font-medium mb-2">Location Map</h4>
          <p className="text-xs text-gray-600 mb-2">
            Each pin represents a different geolocation method. Click markers to see details.
            {pins.length > 1 && (
              <span className="block mt-1 text-orange-600">
                ⚠️ Multiple locations detected - check distance comparison below
              </span>
            )}
          </p>
          <div className="relative w-full h-96 rounded-lg overflow-hidden border border-gray-200">
            <SimpleMap
              ref={mapRef}
              center={mapCenter}
              zoom={pins.length === 1 ? 12 : pins.length > 1 ? 10 : 10}
              pins={{
                sales: pins,
                selectedId: null,
                onPinClick: (id) => {
                  const index = parseInt(id.replace('geo-marker-', ''))
                  const result = results.filter((r) => r.lat !== 0 && r.lng !== 0 && !r.error)[index]
                  if (result) {
                    console.log('[GEOLOCATION_DIAG] Marker clicked:', result)
                    alert(`${result.method}\nLat: ${result.lat.toFixed(6)}\nLng: ${result.lng.toFixed(6)}\nAccuracy: ${result.accuracy ? `${Math.round(result.accuracy)}m` : 'N/A'}`)
                  }
                },
                onClusterClick: () => {},
              }}
              onViewportChange={() => {}}
            />
            {/* Legend overlay */}
            <div className="absolute top-2 right-2 bg-white bg-opacity-90 p-2 rounded shadow-lg text-xs max-h-80 overflow-y-auto">
              <div className="font-semibold mb-1">Methods:</div>
              {results
                .filter((r) => r.lat !== 0 && r.lng !== 0 && !r.error)
                .map((r, index) => (
                  <div key={index} className="flex items-center gap-2 mb-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: methodColors[r.method] || '#6B7280' }}
                    />
                    <span className="truncate max-w-[200px]" title={r.method}>
                      {r.method}
                    </span>
                    {r.accuracy && (
                      <span className="text-gray-500 text-xs">
                        ({Math.round(r.accuracy)}m)
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="mb-6">
        <h4 className="text-md font-medium mb-2">Geolocation Results</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Method
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Latitude
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Longitude
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Accuracy
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Source
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((result, index) => (
                <tr key={index} className={result.error ? 'bg-red-50' : ''}>
                  <td className="px-4 py-2">
                    <div
                      className="w-3 h-3 rounded-full inline-block mr-2"
                      style={{
                        backgroundColor: methodColors[result.method] || '#6B7280',
                      }}
                    />
                    <span className="font-medium">{result.method}</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {result.error ? '-' : result.lat.toFixed(6)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {result.error ? '-' : result.lng.toFixed(6)}
                  </td>
                  <td className="px-4 py-2">
                    {result.accuracy
                      ? `${Math.round(result.accuracy)}m`
                      : result.error
                      ? '-'
                      : 'N/A'}
                  </td>
                  <td className="px-4 py-2 text-xs">{result.source}</td>
                  <td className="px-4 py-2">
                    {result.error ? (
                      <span className="text-red-600 text-xs">{result.error}</span>
                    ) : (
                      <span className="text-green-600 text-xs">✓ Success</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Google Predictions */}
      {googlePredictions.length > 0 && (
        <div className="mb-6">
          <h4 className="text-md font-medium mb-2">Google Predictions</h4>
          <ul className="list-disc pl-5 text-sm text-gray-700">
            {googlePredictions.slice(0, 5).map((p) => (
              <li key={p.placeId}>
                <span className="font-mono text-xs">{p.placeId}</span> — {p.primaryText}
                {p.secondaryText ? <span className="text-gray-500">, {p.secondaryText}</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-right text-gray-500">Powered by Google</p>
        </div>
      )}

      {/* Detailed Information */}
      {results.length > 0 && (
        <div className="mb-6">
          <h4 className="text-md font-medium mb-2">Detailed Information</h4>
          <div className="space-y-3">
            {results
              .filter((r) => !r.error)
              .map((result, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 rounded-md border border-gray-200"
                >
                  <div className="font-medium text-sm mb-1">{result.method}</div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>
                      <span className="font-medium">Coordinates:</span>{' '}
                      {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
                    </div>
                    {result.accuracy && (
                      <div>
                        <span className="font-medium">Accuracy:</span> {Math.round(result.accuracy)}
                        m
                      </div>
                    )}
                    {result.details && (
                      <div>
                        <span className="font-medium">Details:</span>{' '}
                        <pre className="inline-block text-xs bg-white p-1 rounded">
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Timestamp:</span>{' '}
                      {new Date(result.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Distance Comparison */}
      {distances.length > 0 && (
        <div>
          <h4 className="text-md font-medium mb-2">Distance Comparison</h4>
          <p className="text-xs text-gray-600 mb-2">
            Distances between different geolocation methods (sorted by distance):
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    From
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    To
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Distance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {distances.map((dist, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2">{dist.from}</td>
                    <td className="px-4 py-2">{dist.to}</td>
                    <td className="px-4 py-2 font-mono">
                      {dist.distanceKm.toFixed(2)} km ({dist.distanceM.toFixed(0)} m)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

