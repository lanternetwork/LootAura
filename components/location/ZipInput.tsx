'use client'

import { useState, useEffect } from 'react'
import { normalizeGeocode } from '@/lib/contracts/geocode'

interface ZipInputProps {
  onLocationFound: (lat: number, lng: number, city?: string, state?: string, zip?: string) => void
  onError: (error: string) => void
  placeholder?: string
  className?: string
  'data-testid'?: string
}

interface _ZipResolved {
  zip: string
  center: [number, number] // [lng, lat]
  name: string
}

// Cookie utility functions
function setCookie(name: string, value: string, days: number = 1) {
  const expires = new Date()
  expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000))
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`
}

export default function ZipInput({ 
  onLocationFound, 
  onError, 
  placeholder = "Enter ZIP code",
  className = "",
  'data-testid': dataTestId = "zip-input"
}: ZipInputProps) {
  const [zip, setZip] = useState('')
  const [loading, setLoading] = useState(false)

  // Auto-submit for dev (skip in test environment)
  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return
    
    const urlParams = new URLSearchParams(window.location.search)
    const urlZip = urlParams.get('zip')
    const devZip = process.env.NEXT_PUBLIC_DEV_ZIP
    
    const autoZip = urlZip || devZip
    if (autoZip) {
      console.log(`[ZIP_INPUT] dev auto-run zip=${autoZip}`)
      setZip(autoZip)
      performZipLookup(autoZip)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[ZIP_INPUT] submit')
    await performZipLookup()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      console.log('[ZIP_INPUT] Enter key pressed with zip:', zip)
      performZipLookup()
    }
  }

  const performZipLookup = async (zipToUse?: string) => {
    const targetZip = zipToUse || zip
    if (!targetZip || !/^\d{5}$/.test(targetZip)) {
      console.log('[ZIP_INPUT] Invalid zip format:', targetZip)
      onError('Please enter a valid 5-digit ZIP code')
      return
    }

    setLoading(true)
    onError('') // Clear previous errors

    try {
      console.log(`[ZIP_INPUT] Making request to /api/geocoding/zip?zip=${targetZip}`)
      const response = await fetch(`/api/geocoding/zip?zip=${targetZip}`)
      console.log(`[ZIP_INPUT] Response status:`, response.status)
      const data = await response.json()
      console.log(`[ZIP_INPUT] Response data:`, data)

      if (data.ok) {
        // Normalize the geocode response
        const normalized = normalizeGeocode(data)
        console.log(`[ZIP_INPUT] Normalized data:`, normalized)
        
        // Write location cookie with ZIP, city, state info
        const locationData = {
          zip: normalized.zip,
          city: normalized.city,
          state: normalized.state,
          lat: normalized.lat,
          lng: normalized.lng,
          source: normalized.source
        }
        setCookie('la_loc', JSON.stringify(locationData), 1) // 24 hours
        
        console.log(`[ZIP_INPUT] Calling onLocationFound with:`, { 
          lat: normalized.lat, 
          lng: normalized.lng, 
          city: normalized.city, 
          state: normalized.state, 
          zip: normalized.zip 
        })
        onLocationFound(normalized.lat, normalized.lng, normalized.city, normalized.state, normalized.zip)
        console.log(`[ZIP_INPUT] Found location for ${targetZip}: ${normalized.city}, ${normalized.state} (${normalized.source})`)
      } else {
        onError(data.error || 'ZIP code not found')
      }
    } catch (error) {
      console.error('ZIP lookup error:', error)
      console.error('ZIP search error:', error instanceof Error ? error.message : String(error))
      onError('Failed to lookup ZIP code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 ${className}`}>
      <input
        type="text"
        value={zip}
        onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={5}
        data-testid={dataTestId}
        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !zip || zip.length !== 5}
        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Looking up...' : 'Set'}
      </button>
    </form>
  )
}
