'use client'

import { useState } from 'react'

interface ZipInputProps {
  onLocationFound: (lat: number, lng: number, city?: string, state?: string, zip?: string) => void
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[ZIP_INPUT] Form submitted with ZIP:', zip)
    
    if (!zip || !/^\d{5}$/.test(zip)) {
      console.log('[ZIP_INPUT] Invalid ZIP code:', zip)
      onError('Please enter a valid 5-digit ZIP code')
      return
    }

    console.log('[ZIP_INPUT] Starting ZIP lookup for:', zip)
    setLoading(true)
    onError('') // Clear previous errors

    try {
      console.log('[ZIP_INPUT] Making API call to:', `/api/geocoding/zip?zip=${zip}`)
      const response = await fetch(`/api/geocoding/zip?zip=${zip}`)
      const data = await response.json()
      console.log('[ZIP_INPUT] API response:', data)

      if (data.ok) {
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
        
        onLocationFound(data.lat, data.lng, data.city, data.state, data.zip)
        console.log(`[ZIP_INPUT] Found location for ${zip}: ${data.city}, ${data.state} (${data.source})`)
      } else {
        onError(data.error || 'ZIP code not found')
      }
    } catch (error) {
      console.error('ZIP lookup error:', error)
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleSubmit(e as any)
          }
        }}
        placeholder={placeholder}
        maxLength={5}
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
