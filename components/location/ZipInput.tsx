'use client'

import { useState, useEffect } from 'react'
import { normalizeGeocode } from '@/lib/contracts/geocode'

interface ZipInputProps {
  onLocationFound: (lat: number, lng: number, city?: string, state?: string, zip?: string, bbox?: [number, number, number, number]) => void
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
  const [error, setError] = useState('')

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
    const trimmedZip = targetZip?.trim()
    
    // Validate ZIP format: ^\d{5}(-\d{4})?$
    if (!trimmedZip || !/^\d{5}(-\d{4})?$/.test(trimmedZip)) {
      console.log('[ZIP_INPUT] Invalid zip format:', trimmedZip)
      const errorMsg = 'Enter a valid US ZIP (e.g., 40204 or 40204-1234).'
      setError(errorMsg)
      onError(errorMsg)
      return
    }

    setLoading(true)
    setError('') // Clear inline error
    onError('') // Clear previous errors

    try {
      console.log('[ZIP] submit', { zip: trimmedZip, seq: Date.now() })
      console.log('[ZIP] request start')
      
      if (process.env.NEXT_PUBLIC_DEBUG) {
        console.log(`[ZIP_FLOW] input=${targetZip}`)
        console.log(`[ZIP_FLOW] geocode.start`)
      }
      
      console.log(`[ZIP_INPUT] Making request to /api/geocoding/zip?zip=${trimmedZip}`)
      const response = await fetch(`/api/geocoding/zip?zip=${trimmedZip}`)
      console.log(`[ZIP_INPUT] Response status:`, response.status)
      const data = await response.json()
      console.log(`[ZIP_INPUT] Response data:`, data)

      if (data.ok) {
        // Normalize the geocode response
        const normalized = normalizeGeocode(data)
        console.log(`[ZIP_INPUT] Normalized data:`, normalized)
        
        if (process.env.NEXT_PUBLIC_DEBUG) {
          console.log(`[ZIP_FLOW] geocode.result {type=postcode, name=${normalized.city}, center=[${normalized.lng},${normalized.lat}]}`)
        }
        
        // Write location cookie with ZIP, city, state info
        const locationData = {
          zip: trimmedZip,
          city: normalized.city,
          state: normalized.state,
          lat: normalized.lat,
          lng: normalized.lng,
          source: 'geocode'
        }
        setCookie('la_loc', JSON.stringify(locationData), 1) // 24 hours
        
        console.log(`[ZIP_INPUT] Calling onLocationFound with:`, { 
          lat: normalized.lat, 
          lng: normalized.lng, 
          city: normalized.city, 
          state: normalized.state, 
          zip: trimmedZip 
        })
        onLocationFound(normalized.lat, normalized.lng, normalized.city, normalized.state, trimmedZip, normalized.bbox)
        console.log(`[ZIP_INPUT] Found location for ${trimmedZip}: ${normalized.city}, ${normalized.state}`)
        console.log('[ZIP] request success')
      } else {
        console.log('[ZIP] request fail')
        if (process.env.NEXT_PUBLIC_DEBUG) {
          console.log(`[ZIP_FLOW] geocode.invalid`)
        }
        const errorMsg = data.error || 'ZIP code not found'
        setError(errorMsg)
        onError(errorMsg)
      }
    } catch (error) {
      console.log('[ZIP] request fail')
      console.error('ZIP lookup error:', error)
      if (process.env.NEXT_PUBLIC_DEBUG) {
        console.log(`[ZIP_FLOW] geocode.invalid`)
      }
      console.error('ZIP search error:', error instanceof Error ? error.message : String(error))
      const errorMsg = 'Failed to lookup ZIP code'
      setError(errorMsg)
      onError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={zip}
            onChange={(e) => {
              // Allow digits and hyphens, limit to ZIP+4 format
              const value = e.target.value.replace(/[^\d-]/g, '')
              if (value.length <= 10) { // 5 digits + hyphen + 4 digits
                setZip(value)
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={10}
            data-testid={dataTestId}
            className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !zip || !/^\d{5}(-\d{4})?$/.test(zip.trim())}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Looking up...' : 'Set'}
        </button>
      </form>
      {error && (
        <div className="mt-1 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  )
}
