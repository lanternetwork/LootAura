'use client'

import { useEffect, useRef, useState } from 'react'

// Type definitions for Google Maps (if available)
declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (
            inputField: HTMLInputElement,
            options?: {
              types?: string[]
              componentRestrictions?: { country: string }
              fields?: string[]
            }
          ) => {
            getPlace: () => {
              address_components?: Array<{
                long_name: string
                short_name: string
                types: string[]
              }>
              formatted_address?: string
              geometry?: {
                location?: {
                  lat: () => number
                  lng: () => number
                }
              }
            }
            addListener: (event: string, callback: () => void) => void
          }
          AutocompleteService?: unknown
        }
        event?: {
          clearInstanceListeners: (instance: unknown) => void
        }
      }
    }
  }
}

interface AddressAutocompleteProps {
  value: string
  onChange: (address: string) => void
  onPlaceSelected?: (place: {
    address: string
    city: string
    state: string
    zip: string
    lat: number
    lng: number
  }) => void
  placeholder?: string
  className?: string
  required?: boolean
  error?: string
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  placeholder = 'Start typing your address...',
  className = '',
  required = false,
  error
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Load Google Maps Places API script
    if (typeof window !== 'undefined' && !window.google?.maps?.places) {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY}&libraries=places`
      script.async = true
      script.defer = true
      script.onload = () => setIsLoaded(true)
      document.head.appendChild(script)
      
      return () => {
        if (document.head.contains(script)) {
          document.head.removeChild(script)
        }
      }
    } else if (window.google?.maps?.places) {
      setIsLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current || !window.google?.maps?.places?.Autocomplete) return

    // Initialize autocomplete
    const Autocomplete = window.google.maps.places.Autocomplete
    const autocomplete = new Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address', 'geometry']
    })

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      
      if (!place.geometry || !place.geometry.location) {
        return
      }

      // Extract address components
      let streetNumber = ''
      let route = ''
      let city = ''
      let state = ''
      let zip = ''

      place.address_components?.forEach((component: { long_name: string; short_name: string; types: string[] }) => {
        const types = component.types
        if (types.includes('street_number')) {
          streetNumber = component.long_name
        }
        if (types.includes('route')) {
          route = component.long_name
        }
        if (types.includes('locality')) {
          city = component.long_name
        }
        if (types.includes('administrative_area_level_1')) {
          state = component.short_name
        }
        if (types.includes('postal_code')) {
          zip = component.long_name
        }
      })

      const fullAddress = place.formatted_address || `${streetNumber} ${route}`.trim()
      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()

      onChange(fullAddress)
      
      if (onPlaceSelected) {
        onPlaceSelected({
          address: fullAddress,
          city: city || '',
          state: state || '',
          zip: zip || '',
          lat,
          lng
        })
      }
    })

    autocompleteRef.current = autocomplete

    return () => {
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current)
      }
    }
  }, [isLoaded, onChange, onPlaceSelected])

  // Fallback if Google Places API is not available
  if (!process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY) {
    return (
      <div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
          required={required}
          minLength={5}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
        {value && value.length < 5 && (
          <p className="mt-1 text-xs text-gray-500">Address must be at least 5 characters</p>
        )}
      </div>
    )
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        required={required}
        minLength={5}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      {value && value.length < 5 && !error && (
        <p className="mt-1 text-xs text-gray-500">Address must be at least 5 characters</p>
      )}
    </div>
  )
}

