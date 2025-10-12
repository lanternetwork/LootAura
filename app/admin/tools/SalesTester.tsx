'use client'

import React from 'react'
import CopyButton from './CopyButton'

type SalesResponse = {
  ok: boolean
  degraded?: boolean
  durationMs?: number
  count?: number
  data?: Array<{ id: string; title: string; distance_m?: number }>
  error?: string
}

const DEFAULT_MILES = 25
const MILES_TO_KM = 1.609344
const DEFAULT_LIMIT = 24
const CANONICAL_CATEGORIES = [
  'furniture','tools','toys','baby','clothing','electronics','garden','books','video games','kitchen','sports','antiques','collectibles','jewelry'
]

function getCookie(name: string): string | null {
  const v = `; ${document.cookie}`
  const p = v.split(`; ${name}=`)
  if (p.length === 2) return p.pop()!.split(';').shift() || null
  return null
}

export default function SalesTester() {
  const [lat, setLat] = React.useState<string>('')
  const [lng, setLng] = React.useState<string>('')
  const [miles, setMiles] = React.useState<number>(DEFAULT_MILES)
  const [dateRange, setDateRange] = React.useState<'any'|'today'|'weekend'|'next_weekend'>('any')
  const [selectedCats, setSelectedCats] = React.useState<string[]>([])
  const [q, setQ] = React.useState('')
  const [limit, setLimit] = React.useState<number>(DEFAULT_LIMIT)
  const [loading, setLoading] = React.useState(false)
  const [resp, setResp] = React.useState<SalesResponse | null>(null)
  const [url, setUrl] = React.useState<string>('')

  // Prefill from la_loc cookie on mount
  React.useEffect(() => {
    try {
      const cookie = getCookie('la_loc')
      if (cookie) {
        const obj = JSON.parse(cookie)
        if (obj?.lat && obj?.lng) {
          setLat(String(obj.lat))
          setLng(String(obj.lng))
        }
      }
    } catch {}
  }, [])

  const toggleCat = (c: string) => {
    setSelectedCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  const buildUrl = (): string => {
    const km = Math.max(1, Math.min(miles * MILES_TO_KM, 160)).toFixed(4)
    const params = new URLSearchParams()
    if (lat) params.set('lat', lat)
    if (lng) params.set('lng', lng)
    params.set('distanceKm', km)
    if (dateRange !== 'any') params.set('dateRange', dateRange)
    if (selectedCats.length) params.set('categories', selectedCats.join(','))
    if (q) params.set('q', q)
    params.set('limit', String(limit))
    return `/api/sales?${params.toString()}`
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResp(null)
    const u = buildUrl()
    setUrl(u)
    setLoading(true)
    try {
      const r = await fetch(u, { cache: 'no-store' })
      const j = await r.json()
      // Normalize minimal fields for display
      const data = Array.isArray(j?.data) ? j.data : []
      const out: SalesResponse = {
        ok: !!j?.ok || r.ok,
        degraded: j?.degraded,
        durationMs: j?.durationMs,
        count: j?.count ?? data.length,
        data: data.slice(0, 5).map((x: any) => ({ id: x.id, title: x.title, distance_m: x.distance_m })) ,
        error: j?.error
      }
      setResp(out)
    } catch (e: any) {
      setResp({ ok: false, error: 'Request failed' })
    } finally {
      setLoading(false)
    }
  }

  const openNewTab = () => {
    const u = url || buildUrl()
    window.open(u, '_blank')
  }

  return (
    <div className="space-y-3 text-sm">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-neutral-700">Latitude</label>
          <input className="w-full rounded border px-2 py-1" value={lat} onChange={(e)=>setLat(e.target.value)} placeholder="e.g. 38.25" />
        </div>
        <div>
          <label className="block text-neutral-700">Longitude</label>
          <input className="w-full rounded border px-2 py-1" value={lng} onChange={(e)=>setLng(e.target.value)} placeholder="e.g. -85.75" />
        </div>
        <div>
          <label className="block text-neutral-700">Distance (miles)</label>
          <input type="number" min={1} max={100} className="w-full rounded border px-2 py-1" value={miles} onChange={(e)=>setMiles(Number(e.target.value||DEFAULT_MILES))} />
        </div>
        <div>
          <label className="block text-neutral-700">Date Range</label>
          <select className="w-full rounded border px-2 py-1" value={dateRange} onChange={(e)=>setDateRange(e.target.value as any)}>
            <option value="any">any</option>
            <option value="today">today</option>
            <option value="weekend">weekend</option>
            <option value="next_weekend">next_weekend</option>
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-neutral-700">Categories</label>
          <div className="flex flex-wrap gap-2">
            {CANONICAL_CATEGORIES.map(c => (
              <button
                type="button"
                key={c}
                onClick={() => toggleCat(c)}
                className={`rounded px-2 py-1 text-xs border ${selectedCats.includes(c) ? 'bg-amber-100 border-amber-300' : 'bg-white'}`}
              >{c}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-neutral-700">Query (q)</label>
          <input className="w-full rounded border px-2 py-1" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="text search" />
        </div>
        <div>
          <label className="block text-neutral-700">Limit</label>
          <input type="number" min={1} max={100} className="w-full rounded border px-2 py-1" value={limit} onChange={(e)=>setLimit(Number(e.target.value||DEFAULT_LIMIT))} />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={loading} className="rounded border px-3 py-1">{loading ? 'Running…' : 'Run'}</button>
          <button type="button" onClick={openNewTab} className="rounded border px-3 py-1">Open in new tab</button>
          {url && <CopyButton text={url} className="rounded border px-2 py-1 text-xs">Copy URL</CopyButton>}
        </div>
      </form>

      {resp && (
        <div className="rounded border bg-neutral-50 p-3">
          <div className="mb-1 font-medium">Result</div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono sm:grid-cols-4">
            <div>status: {resp.ok ? 'ok' : 'error'}</div>
            <div>ms: {resp.durationMs ?? '-'}</div>
            <div>degraded: {resp.degraded ? 'true' : 'false'}</div>
            <div>count: {resp.count ?? '-'}</div>
          </div>
          {resp.data && resp.data.length > 0 && (
            <div className="mt-2 text-xs">
              <div className="mb-1 font-medium">First 5</div>
              <ul className="list-disc pl-5">
                {resp.data.map((r) => (
                  <li key={r.id} className="font-sans">
                    <span className="font-medium">{r.title}</span>
                    {typeof r.distance_m === 'number' && (
                      <span className="text-neutral-600"> — {(r.distance_m/1000).toFixed(1)} km</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!resp.ok && resp.error && (
            <div className="mt-2 text-xs text-amber-700">{resp.error}</div>
          )}
        </div>
      )}
    </div>
  )
}


