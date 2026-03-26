'use client'

import { useState } from 'react'
import { getCsrfHeaders } from '@/lib/csrf-client'
import { deterministicScatter, scatterSeed, normalizeZipForValidation, batchStatuses, buildBatchReport, buildCreatedSaleFromCreateResponse, isCompleteZipResolution, type BatchReport, type CreatedSale } from '@/lib/admin/testSalesSpread'

const MAX_SALES = 50
const MIN_SALES = 1
const DEFAULT_SPREAD_DEGREES = 0.015
const SPREAD_MIN = 0.001
const SPREAD_MAX = 0.1

const TITLES = [
  'Community Yard Sale',
  'Estate Sale - Everything Must Go',
  'Moving Sale',
  'Garage Sale - Great Finds',
  'Weekend Yard Sale',
  'Multi-Family Sale',
  'Antique & Collectibles Sale',
  'Holiday Clearance Sale',
]

// Fixed, approved Cloudinary demo image pool for Test Sales Generator.
// Must match isAllowedImageUrl rules: https://res.cloudinary.com/<cloud>/image/upload/**
const DEMO_IMAGE_URLS: string[] = [
  'https://res.cloudinary.com/deg2szdqf/image/upload/v1769083249/lootaura/sales/lxxnw1cdpya7ynocmve3.png',
  'https://res.cloudinary.com/deg2szdqf/image/upload/v1773522297/lootaura/sales/hqywpapadsobmgwrdury.jpg',
  'https://res.cloudinary.com/deg2szdqf/image/upload/v1773579888/ChatGPT_Image_Mar_15_2026_09_04_38_AM_rn6pll.png',
  'https://res.cloudinary.com/deg2szdqf/image/upload/v1773579970/ChatGPT_Image_Mar_15_2026_09_05_53_AM_lmwgpg.png',
  'https://res.cloudinary.com/deg2szdqf/image/upload/v1773580212/ChatGPT_Image_Mar_15_2026_09_10_05_AM_blr9op.png',
]

function getDemoMediaForIndex(index: number): { cover_image_url: string; images: string[] } {
  const pool = DEMO_IMAGE_URLS
  const len = pool.length
  // Safety: fall back to empty strings if pool is misconfigured, but keep behavior deterministic.
  if (len === 0) {
    return { cover_image_url: '', images: [] }
  }
  const cover = pool[index % len]
  const images: string[] = [cover]
  if (len > 1) {
    images.push(pool[(index + 1) % len])
  }
  return { cover_image_url: cover, images }
}

interface ZipResolution {
  zip: string
  lat: number
  lng: number
  city: string
  state: string
}

export default function TestSalesGenerator() {
  const [zipCode, setZipCode] = useState('40202')
  const [numberOfSales, setNumberOfSales] = useState(8)
  const [spreadRadiusDegrees, setSpreadRadiusDegrees] = useState(DEFAULT_SPREAD_DEGREES)
  const [publishedOnly, setPublishedOnly] = useState(true)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [createdSales, setCreatedSales] = useState<CreatedSale[]>([])
  const [report, setReport] = useState<BatchReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  function validate(): string | null {
    const zip = normalizeZipForValidation(zipCode)
    if (!zip) return 'ZIP code must be 5 digits.'
    if (numberOfSales < MIN_SALES || numberOfSales > MAX_SALES) {
      return `Number of sales must be between ${MIN_SALES} and ${MAX_SALES}.`
    }
    if (spreadRadiusDegrees < SPREAD_MIN || spreadRadiusDegrees > SPREAD_MAX) {
      return `Spread radius must be between ${SPREAD_MIN} and ${SPREAD_MAX} degrees.`
    }
    return null
  }

  async function resolveZip(zip: string): Promise<ZipResolution | null> {
    const res = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(zip)}`)
    const data = await res.json()
    if (!data.ok || data.lat == null || data.lng == null) {
      return null
    }
    return {
      zip: data.zip || zip,
      lat: Number(data.lat),
      lng: Number(data.lng),
      city: data.city || 'Unknown',
      state: data.state || '',
    }
  }

  async function createOneSale(
    status: 'published' | 'draft' | 'archived',
    daysOffset: number,
    point: { lat: number; lng: number },
    geo: ZipResolution,
    index: number
  ): Promise<CreatedSale> {
    const today = new Date()
    const saleDate = new Date(today)
    saleDate.setDate(today.getDate() + daysOffset)
    const dateStr = saleDate.toISOString().split('T')[0]
    const baseTitle = TITLES[index % TITLES.length]
    const title = `${baseTitle} - ${status}`
    const media = getDemoMediaForIndex(index)

    const saleData = {
      title,
      description: `Test sale for ${status}. Created for demo.`,
      address: `${100 + (index % 900)} Main St`,
      city: geo.city,
      state: geo.state,
      zip_code: geo.zip,
      lat: point.lat,
      lng: point.lng,
      date_start: dateStr,
      time_start: '09:00:00',
      date_end: dateStr,
      time_end: '17:00:00',
      status,
      pricing_mode: 'negotiable',
      cover_image_url: media.cover_image_url,
      images: media.images,
    }

    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
      credentials: 'include',
      body: JSON.stringify(saleData),
    })

    const data = await response.json()

    if (response.status === 401) {
      throw new Error('You must be signed in to create sales. Please sign in and try again.')
    }
    if (!response.ok || !data.ok) {
      const msg = data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to create sale'
      throw new Error(msg)
    }

    // API returns only { ok: true, saleId } — build CreatedSale locally so the list never has undefined
    return buildCreatedSaleFromCreateResponse(data, title, status, dateStr)
  }

  async function createTestSales() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      setReport(null)
      return
    }

    const zip = normalizeZipForValidation(zipCode)!
    setLoading(true)
    setError(null)
    setReport(null)
    setCreatedSales([])
    setProgress('Resolving ZIP...')

    try {
      const geo = await resolveZip(zip)
      if (!geo) {
        setError('ZIP code not found. Try another ZIP or check the geocoding service.')
        setProgress(null)
        return
      }

      if (!isCompleteZipResolution(geo)) {
        setError('ZIP resolved to incomplete location data (missing or invalid city/state). Use a ZIP that returns full location, or try another ZIP.')
        setReport(
          buildBatchReport(0, 0, geo.zip, geo.city ?? '', geo.state ?? '', null)
        )
        setProgress(null)
        setLoading(false)
        return
      }

      const seed = scatterSeed(zip, numberOfSales, spreadRadiusDegrees)
      const points = deterministicScatter(geo.lat, geo.lng, numberOfSales, spreadRadiusDegrees, seed)
      const statuses = batchStatuses(numberOfSales, publishedOnly)

      const created: CreatedSale[] = []
      let failureMessage: string | null = null

      for (let i = 0; i < numberOfSales; i++) {
        setProgress(`Creating ${i + 1}/${numberOfSales}...`)
        const status = statuses[i] ?? 'published'
        const daysOffset = status === 'published' ? i : status === 'draft' ? 7 : -7
        const point = points[i]
        if (!point) {
          failureMessage = failureMessage ? `${failureMessage}; Missing point for index ${i}` : `Missing point for index ${i}`
          continue
        }
        try {
          const sale = await createOneSale(status, daysOffset, point, geo, i)
          created.push(sale)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          failureMessage = failureMessage ? `${failureMessage}; ${msg}` : msg
        }
      }

      setCreatedSales(created)
      setReport(
        buildBatchReport(
          numberOfSales,
          created.length,
          geo.zip,
          geo.city,
          geo.state,
          failureMessage || null
        )
      )
      setProgress(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create test sales')
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Test Sales Generator</h3>
      <p className="text-sm text-gray-600 mb-4">
        Create test sales for your account (e.g. for demos). Sales are created via the normal flow;
        you must be signed in. All sales are centered on the given ZIP with a deterministic spread.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ZIP code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="40202"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of sales (1–{MAX_SALES})
          </label>
          <input
            type="number"
            min={MIN_SALES}
            max={MAX_SALES}
            value={numberOfSales}
            onChange={(e) => setNumberOfSales(Math.min(MAX_SALES, Math.max(MIN_SALES, parseInt(e.target.value, 10) || MIN_SALES)))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Spread radius (degrees, {SPREAD_MIN}–{SPREAD_MAX})
          </label>
          <input
            type="number"
            min={SPREAD_MIN}
            max={SPREAD_MAX}
            step={0.001}
            value={spreadRadiusDegrees}
            onChange={(e) => setSpreadRadiusDegrees(parseFloat(e.target.value) || DEFAULT_SPREAD_DEGREES)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="published-only"
            checked={publishedOnly}
            onChange={(e) => setPublishedOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="published-only" className="text-sm text-gray-700">
            Published only (recommended for map demos)
          </label>
        </div>
      </div>

      <button
        onClick={createTestSales}
        disabled={loading}
        className="mt-4 w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {loading ? (progress || 'Creating...') : 'Create Test Sales'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 font-medium">Error:</p>
          <p className="text-red-600 text-sm">{error}</p>
          {error.includes('signed in') && (
            <p className="text-red-600 text-sm mt-2">
              <a href="/auth/signin" className="underline">Sign in</a>
            </p>
          )}
        </div>
      )}

      {report && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-blue-800 font-medium mb-1">Report</p>
          <p className="text-blue-800 text-sm">
            Requested: {report.requested} · Succeeded: {report.succeeded} · Location: {report.zip} ({report.city}, {report.state})
          </p>
          {report.failureMessage && (
            <p className="text-amber-800 text-sm mt-1">Failures: {report.failureMessage}</p>
          )}
        </div>
      )}

      {createdSales.length > 0 && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-800 font-medium mb-2">Created {createdSales.length} test sales</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {createdSales.map((sale) => (
              <div key={sale.id} className="text-sm bg-white p-2 rounded border">
                <div className="font-medium">{sale.title}</div>
                <div className="text-gray-600">
                  Status: <span className="font-medium">{sale.status}</span> · Date: {sale.date_start}
                </div>
              </div>
            ))}
          </div>
          <p className="text-green-800 text-sm mt-3">
            Check the map and your dashboard to see these sales.
          </p>
        </div>
      )}
    </div>
  )
}
