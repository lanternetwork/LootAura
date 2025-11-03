'use client'

import { useState } from 'react'

interface ZipInputProps {
  onLocationFound: (lat: number, lng: number, city?: string, state?: string, zip?: string, bbox?: [number, number, number, number]) => void
  onError: (error: string) => void
  placeholder?: string
  className?: string
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
  className = ""
}: ZipInputProps) {
  const [zip, setZip] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidFlash, setInvalidFlash] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[ZIP_INPUT] Form submitted with zip:', zip)
    await performZipLookup()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      console.log('[ZIP_INPUT] Enter key pressed with zip:', zip)
      performZipLookup()
    }
  }

  const performZipLookup = async () => {
    // Support both 5-digit and ZIP+4 format
    const trimmedZip = zip.trim()
    const zipRegex = /^\d{5}(-\d{4})?$/
    
    if (!trimmedZip || !zipRegex.test(trimmedZip)) {
      const errorMsg = 'Please enter a valid ZIP code (5 digits or ZIP+4)'
      console.log('[ZIP_INPUT] Invalid zip format:', trimmedZip)
      setError(errorMsg)
      // Flash the button with a red X to indicate invalid
      setInvalidFlash(true)
      setTimeout(() => setInvalidFlash(false), 800)
      onError(errorMsg)
      return
    }

    setLoading(true)
    setError(null)
    onError('') // Clear previous errors

    try {
      console.log('[ZIP_INPUT] Request start for:', trimmedZip)
      const response = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(trimmedZip)}`)
      const data = await response.json()

      if (data.ok) {
        console.log('[ZIP_INPUT] Request success for:', trimmedZip)
        
        // Write location cookie with ZIP, city, state info
        const locationData = {
          zip: data.zip,
          city: data.city,
          state: data.state,
          lat: data.lat,
          lng: data.lng,
          source: data.source
        }
        setCookie('la_loc', JSON.stringify(locationData), 1) // 24 hours
        
        // Pass bbox if available
        const bbox = data.bbox ? [data.bbox[0], data.bbox[1], data.bbox[2], data.bbox[3]] as [number, number, number, number] : undefined
        onLocationFound(data.lat, data.lng, data.city, data.state, data.zip, bbox)
        console.log(`[ZIP_INPUT] Found location for ${trimmedZip}: ${data.city}, ${data.state} (${data.source})`)
      } else {
        const errorMsg = data.error || 'ZIP code not found'
        console.log('[ZIP_INPUT] Request fail for:', trimmedZip, errorMsg)
        setError(errorMsg)
        setInvalidFlash(true)
        setTimeout(() => setInvalidFlash(false), 800)
        onError(errorMsg)
      }
    } catch (error) {
      const errorMsg = 'Failed to lookup ZIP code'
      console.error('[ZIP_INPUT] Request error for:', trimmedZip, error)
      setError(errorMsg)
      setInvalidFlash(true)
      setTimeout(() => setInvalidFlash(false), 800)
      onError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={zip}
          onChange={(e) => {
            // Allow digits and hyphens, limit to 10 chars (ZIP+4 format)
            const value = e.target.value.replace(/[^\d-]/g, '').slice(0, 10)
            setZip(value)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={10}
          className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent min-h-[40px] ${
            error ? 'border-red-300' : 'border-gray-300'
          }`}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !zip || (zip.length < 5)}
          className={`px-4 py-2 rounded-md min-h-[34px] w-[40px] flex items-center justify-center appearance-none disabled:cursor-not-allowed ${
            invalidFlash 
              ? 'border border-red-600 text-red-600 bg-transparent hover:bg-[rgba(220,38,38,0.06)]' 
              : 'btn-accent'
          }`}
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            invalidFlash ? (
              <span aria-label="Invalid" className="font-bold">×</span>
            ) : (
              <span>Set</span>
            )
          )}
        </button>
      </form>
    </div>
  )
}
