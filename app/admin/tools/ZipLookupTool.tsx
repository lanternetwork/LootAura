'use client'

import React from 'react'
import CopyButton from './CopyButton'

type ZipResult = {
  ok: boolean
  zip?: string
  lat?: number
  lng?: number
  city?: string
  state?: string
  source?: 'local' | 'nominatim'
  error?: string
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${value};expires=${expires};path=/;SameSite=Lax`
}

export default function ZipLookupTool() {
  const [zip, setZip] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [res, setRes] = React.useState<ZipResult | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setRes(null)
    const cleaned = (zip || '').replace(/\D/g, '').slice(-5).padStart(5, '0')
    if (!/^\d{5}$/.test(cleaned)) {
      setErr('Enter a valid 5-digit ZIP')
      return
    }
    setLoading(true)
    try {
      const r = await fetch(`/api/geocoding/zip?zip=${cleaned}`)
      const j = await r.json()
      if (!r.ok || !j?.ok) {
        setErr(j?.error || 'ZIP not found')
      } else {
        setRes(j as ZipResult)
      }
    } catch (e: any) {
      setErr('Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  const centerOnZip = () => {
    if (!res?.lat || !res?.lng) return
    const payload = {
      zip: res.zip,
      lat: res.lat,
      lng: res.lng,
      city: res.city,
      state: res.state,
      source: res.source || 'local'
    }
    setCookie('la_loc', JSON.stringify(payload), 1)
    const km = 40.2336 // 25 miles
    const url = `/sales?lat=${res.lat}&lng=${res.lng}&distanceKm=${km}`
    window.open(url, '_blank')
  }

  const salesUrl = res?.lat && res?.lng
    ? `/api/sales?lat=${res.lat}&lng=${res.lng}&distanceKm=40.2336`
    : ''

  return (
    <div className="space-y-3 text-sm">
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
        <label className="text-neutral-700">ZIP</label>
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="e.g. 40204"
          className="w-32 rounded border px-2 py-1"
          inputMode="numeric"
          maxLength={10}
        />
        <button type="submit" disabled={loading} className="rounded border px-3 py-1">
          {loading ? 'Looking…' : 'Lookup'}
        </button>
      </form>
      {err && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-800">{err}</div>
      )}
      {res && !err && (
        <div className="rounded border bg-neutral-50 p-3">
          <div className="mb-2 font-medium">Result</div>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-3">
            <div>lat: {res.lat}</div>
            <div>lng: {res.lng}</div>
            <div>city: {res.city}</div>
            <div>state: {res.state}</div>
            <div>source: {res.source}</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={centerOnZip} className="rounded border px-2 py-1 text-xs">
              Center sales on this ZIP
            </button>
            {salesUrl && (
              <CopyButton text={salesUrl} className="rounded border px-2 py-1 text-xs">
                Copy /api/sales URL
              </CopyButton>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


