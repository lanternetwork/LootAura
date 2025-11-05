'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { geocodeAddress, fetchSuggestions, AddressSuggestion } from '@/lib/geocode'
import { useDebounce } from '@/lib/hooks/useDebounce'
import OSMAttribution from './OSMAttribution'

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
  const listboxRef = useRef<HTMLUListElement>(null)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [userLat, setUserLat] = useState<number | undefined>(undefined)
  const [userLng, setUserLng] = useState<number | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const lastHadCoordsRef = useRef<boolean>(false)
  const requestIdRef = useRef(0)
  const geoWaitRef = useRef<boolean>(false)
  const firstRequestRef = useRef<boolean>(true)

  // Debounce search query
  const debouncedQuery = useDebounce(value, 300)

  // Use IP geolocation (no browser prompt) for proximity bias
  useEffect(() => {
    geoWaitRef.current = true
    fetch('/api/geolocation/ip')
      .then(res => res.ok ? res.json() : null)
      .then(ipData => {
        if (ipData?.lat && ipData?.lng) {
          setUserLat(ipData.lat)
          setUserLng(ipData.lng)
        }
        geoWaitRef.current = false
      })
      .catch(() => {
        geoWaitRef.current = false
      })
  }, [])

  // Fetch suggestions when query changes
  useEffect(() => {
    // Enforce min 3 chars (match API requirement)
    if (!debouncedQuery || debouncedQuery.length < 3) {
      setSuggestions([])
      setIsOpen(false)
      return
    }
    const currentId = ++requestIdRef.current
    setIsLoading(true)

    // Wait up to 400ms for geolocation on first request
    const shouldWait = firstRequestRef.current && geoWaitRef.current && (!userLat || !userLng)
    const delay = shouldWait ? 400 : 0
    firstRequestRef.current = false

    const timer = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const hadCoords = Boolean(userLat && userLng)
      lastHadCoordsRef.current = hadCoords
      // Always pass coords once available
      if (process.env.NODE_ENV === 'development') {
        console.log('[AddressAutocomplete] Fetching suggestions', { query: debouncedQuery.substring(0, 20), userLat, userLng })
      }
      fetchSuggestions(debouncedQuery, userLat, userLng, controller.signal)
        .then((results) => {
          if (requestIdRef.current !== currentId) return
          const unique: AddressSuggestion[] = []
          const seen = new Set<string>()
          for (const s of results) {
            const key = s.id
            if (!seen.has(key)) {
              seen.add(key)
              unique.push(s)
            }
          }
          if (process.env.NODE_ENV === 'development' && unique.length > 0) {
            console.log('[AddressAutocomplete] Received suggestions', { count: unique.length, first: unique[0]?.label })
          }
          setSuggestions(unique)
          setIsOpen(unique.length > 0)
          setSelectedIndex(-1)
        })
        .catch((err) => {
          if (requestIdRef.current !== currentId) return
          if (err?.name === 'AbortError') return
          console.error('Suggest error:', err)
          setSuggestions([])
          setIsOpen(false)
        })
        .finally(() => {
          if (requestIdRef.current === currentId) setIsLoading(false)
        })
    }, delay)

    return () => clearTimeout(timer)
  }, [debouncedQuery, userLat, userLng])

  // If last fetch lacked coords and coords arrive, abort stale request and refetch with coords
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 3) return
    if (!userLat || !userLng) return
    if (lastHadCoordsRef.current) return
    const currentId = ++requestIdRef.current
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    fetchSuggestions(debouncedQuery, userLat, userLng, controller.signal)
      .then((results) => {
        if (requestIdRef.current !== currentId) return
        const unique: AddressSuggestion[] = []
        const seen = new Set<string>()
        for (const s of results) {
          const key = s.id
          if (!seen.has(key)) {
            seen.add(key)
            unique.push(s)
          }
        }
        setSuggestions(unique)
        setIsOpen(unique.length > 0)
        setSelectedIndex(-1)
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [userLat, userLng, debouncedQuery])

  // Handle suggestion selection
  const handleSelect = useCallback((suggestion: AddressSuggestion) => {
    const address = suggestion.label
    const city = suggestion.address?.city || ''
    const state = suggestion.address?.state || ''
    const zip = suggestion.address?.postcode || ''

    onChange(address)
    setIsOpen(false)
    setSuggestions([])

    if (onPlaceSelected) {
      onPlaceSelected({
        address,
        city,
        state,
        zip,
        lat: suggestion.lat,
        lng: suggestion.lng
      })
    }
  }, [onChange, onPlaceSelected])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Enter' && value.length >= 5) {
        handleBlur()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setSuggestions([])
        break
    }
  }

  // Handle blur (geocode if no selection)
  const handleBlur = async () => {
    // Delay to allow click on suggestion to register
    setTimeout(async () => {
      if (value && value.length >= 5 && onPlaceSelected && !isGeocoding && !isOpen) {
        setIsGeocoding(true)
        try {
          const result = await geocodeAddress(value)
          if (result) {
            onPlaceSelected({
              address: result.formatted_address,
              city: result.city || '',
              state: result.state || '',
              zip: result.zip || '',
              lat: result.lat,
              lng: result.lng
            })
          }
        } catch (err) {
          console.error('Geocoding error:', err)
        } finally {
          setIsGeocoding(false)
        }
      }
    }, 200)
  }

  // Handle input focus
  const handleFocus = () => {
    if (debouncedQuery && debouncedQuery.length >= 3 && suggestions.length > 0) {
      setIsOpen(true)
    }
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        listboxRef.current &&
        !listboxRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={className}
          required={required}
          minLength={5}
          disabled={isGeocoding}
          autoComplete="section-sell address-line1"
          name="sale_address_line1"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="address-suggestions"
          aria-activedescendant={selectedIndex >= 0 ? `suggestion-${selectedIndex}` : undefined}
          role="combobox"
        />
        
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
        
        {value && value.length < 5 && !error && (
          <p className="mt-1 text-xs text-gray-500">Address must be at least 5 characters</p>
        )}
        
        {isGeocoding && (
          <p className="mt-1 text-xs text-gray-500">Looking up address...</p>
        )}

        {isLoading && value.length >= 3 && (
          <p className="mt-1 text-xs text-gray-500">Searching...</p>
        )}

        {/* Suggestions listbox */}
        {isOpen && suggestions.length > 0 && (
          <ul
            ref={listboxRef}
            id="address-suggestions"
            role="listbox"
            className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`suggestion-${index}`}
                role="option"
                aria-selected={selectedIndex === index}
                className={`px-4 py-2 cursor-pointer hover:bg-gray-100 ${
                  selectedIndex === index ? 'bg-gray-100' : ''
                }`}
                onClick={() => handleSelect(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="font-medium">{suggestion.label}</div>
                {suggestion.address && (
                  <div className="text-xs text-gray-500">
                    {[
                      suggestion.address.houseNumber,
                      suggestion.address.road,
                      suggestion.address.city,
                      suggestion.address.state,
                      suggestion.address.postcode
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* OSM Attribution - outside relative container to avoid z-index issues */}
      <div className="mt-2">
        <OSMAttribution showGeocoding={true} />
      </div>
    </div>
  )
}
