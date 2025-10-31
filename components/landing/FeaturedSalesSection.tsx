'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import SaleCard from '@/components/SaleCard'
import SaleCardSkeleton from '@/components/SaleCardSkeleton'
import { Sale } from '@/lib/types'

interface LocationState {
  zip?: string
  lat?: number
  lng?: number
}

export function FeaturedSalesSection() {
  const searchParams = useSearchParams()
  const [location, setLocation] = useState<LocationState | null>(null)
  const [status, setStatus] = useState<'resolving' | 'ready' | 'error'>('resolving')
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [zipInput, setZipInput] = useState('')

  // Location inference in useEffect
  useEffect(() => {
    // 1) URL first
    const zipFromUrl = searchParams.get('zip') || searchParams.get('postal')
    if (zipFromUrl) {
      setLocation({ zip: zipFromUrl })
      setStatus('ready')
      return
    }

    // 2) localStorage
    const saved = window.localStorage.getItem('loot-aura:lastLocation')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed && (parsed.zip || (parsed.lat && parsed.lng))) {
          setLocation(parsed)
          setStatus('ready')
          return
        }
      } catch {
        // Invalid JSON, continue
      }
    }

    // 3) geolocation (non-blocking)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          window.localStorage.setItem('loot-aura:lastLocation', JSON.stringify(loc))
          setLocation(loc)
          setStatus('ready')
        },
        () => {
          // 4) fallback city
          const fallback = { zip: '40204' }
          setLocation(fallback)
          setStatus('ready')
        },
        { enableHighAccuracy: false, timeout: 3500 }
      )
      return
    }

    // 4) final fallback
    setLocation({ zip: '40204' })
    setStatus('ready')
  }, [searchParams])

  // Fetch sales when location is ready
  useEffect(() => {
    if (status !== 'ready' || !location) return

    const fetchSales = async () => {
      setLoading(true)
      try {
        let url = '/api/sales?near=1&limit=6'
        
        if (location.lat && location.lng) {
          url += `&lat=${location.lat}&lng=${location.lng}&radiusKm=25`
        } else if (location.zip) {
          url += `&zip=${encodeURIComponent(location.zip)}&radiusKm=25`
        } else {
          // No valid location
          setLoading(false)
          return
        }

        const res = await fetch(url)
        const data = await res.json()
        
        // Handle different response formats
        if (data.sales) {
          setSales(data.sales)
        } else if (data.data && Array.isArray(data.data)) {
          setSales(data.data)
        } else if (Array.isArray(data)) {
          setSales(data)
        } else {
          setSales([])
        }
      } catch (error) {
        console.error('Failed to fetch featured sales:', error)
        setSales([])
      } finally {
        setLoading(false)
      }
    }

    fetchSales()
  }, [status, location])

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedZip = zipInput.trim()
    const zipRegex = /^\d{5}(-\d{4})?$/
    
    if (!trimmedZip || !zipRegex.test(trimmedZip)) {
      return
    }

    try {
      const response = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(trimmedZip)}`)
      const data = await response.json()

      if (data.ok) {
        const loc = { lat: data.lat, lng: data.lng, zip: data.zip }
        window.localStorage.setItem('loot-aura:lastLocation', JSON.stringify(loc))
        setLocation(loc)
        setStatus('ready')
        setZipInput('')
      }
    } catch (error) {
      console.error('Failed to lookup ZIP:', error)
    }
  }

  // Resolving location state
  if (status === 'resolving' || loading) {
    return (
      <section className="py-12 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268]">
              Featured sales near you
            </h2>
            <Link
              href="/sales"
              className="text-sm text-[#3A2268]/70 hover:text-[#3A2268] transition-colors inline-flex items-center gap-1"
            >
              View all →
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SaleCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    )
  }

  // Location failed - show ZIP picker
  if (status === 'error' || !location) {
    return (
      <section className="py-12 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268]">
              Featured sales near you
            </h2>
            <Link
              href="/sales"
              className="text-sm text-[#3A2268]/70 hover:text-[#3A2268] transition-colors inline-flex items-center gap-1"
            >
              View all →
            </Link>
          </div>
          <div className="rounded-2xl border border-[#3A2268]/10 bg-[#F9FFF2] p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#3A2268] mb-1">Set your location</h3>
              <p className="text-sm text-[#3A2268]/70">Enter your ZIP so we can show nearby sales.</p>
            </div>
            <form onSubmit={handleZipSubmit} className="flex gap-2 w-full md:w-auto">
              <input
                type="text"
                value={zipInput}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^\d-]/g, '').slice(0, 10)
                  setZipInput(value)
                }}
                placeholder="Enter ZIP code"
                className="flex-1 md:w-32 px-3 py-2 border border-[#3A2268]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4B63A] focus:border-transparent text-[#3A2268]"
              />
              <button
                type="submit"
                disabled={!zipInput || zipInput.length < 5}
                className="px-4 py-2 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Save
              </button>
            </form>
          </div>
        </div>
      </section>
    )
  }

  // Location resolved - show sales
  const displaySales = sales.slice(0, 6)
  const locationDisplay = location.zip || `${location.lat?.toFixed(2)}, ${location.lng?.toFixed(2)}`

  return (
    <section className="py-12 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268]">
            Featured sales near you
          </h2>
          <Link
            href="/sales"
            className="text-sm text-[#3A2268]/70 hover:text-[#3A2268] transition-colors inline-flex items-center gap-1"
          >
            View all →
          </Link>
        </div>
        
        {displaySales.length === 0 ? (
          <div className="rounded-2xl border border-[#3A2268]/10 bg-white p-8 text-center">
            <p className="text-lg text-[#3A2268] mb-2">No sales near {locationDisplay} yet.</p>
            <p className="text-sm text-[#3A2268]/70 mb-4">
              Be the first to post a sale in your area!
            </p>
            <Link
              href="/sell/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium rounded-lg transition-colors"
            >
              Post your sale →
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displaySales.map((sale) => (
              <SaleCard key={sale.id} sale={sale} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
