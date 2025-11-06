'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { geocodeAddress, fetchSuggestions, fetchOverpassAddresses, AddressSuggestion } from '@/lib/geocode'
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
  userLat?: number
  userLng?: number
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  placeholder = 'Start typing your address...',
  className = '',
  required = false,
  error,
  userLat: propUserLat,
  userLng: propUserLng
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showFallbackMessage, setShowFallbackMessage] = useState(false)
  const [userLat, setUserLat] = useState<number | undefined>(undefined)
  const [userLng, setUserLng] = useState<number | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const lastHadCoordsRef = useRef<boolean>(false)
  const requestIdRef = useRef(0)
  const geoWaitRef = useRef<boolean>(false)

  // Debounce search query (50ms for real-time feel)
  const debouncedQuery = useDebounce(value, 50)

  // Use location from props if provided, otherwise fetch IP geolocation (no browser prompt) for proximity bias
  useEffect(() => {
    if (propUserLat && propUserLng) {
      // Location provided via props (from server-side) - use it directly
      setUserLat(propUserLat)
      setUserLng(propUserLng)
      geoWaitRef.current = false
    } else {
      // No props provided - fetch IP geolocation client-side
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
    }
  }, [propUserLat, propUserLng])

  // Fetch suggestions when query changes
  useEffect(() => {
    const trimmedQuery = debouncedQuery?.trim() || ''
    
    // Check query patterns
    const isNumericOnly = /^\d{1,6}$/.test(trimmedQuery)
    const digitsStreetMatch = trimmedQuery.match(/^(?<num>\d{1,8})\s+(?<street>[A-Za-z].+)$/)
    const isDigitsStreet = digitsStreetMatch !== null
    const hasCoords = Boolean(userLat && userLng)
    
    // Minimum length: 1 for numeric-only, 2 for general text
    const minLength = isNumericOnly ? 1 : 2
    if (!trimmedQuery || trimmedQuery.length < minLength) {
      setSuggestions([])
      setIsOpen(false)
      setShowFallbackMessage(false)
      return
    }
    
    const currentId = ++requestIdRef.current
    setIsLoading(true)
    setShowFallbackMessage(false)

    // Don't block on location - send request immediately (with or without coords)
    // Will refresh automatically when coords arrive (see useEffect below)
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    lastHadCoordsRef.current = hasCoords
    
    // For digits+street queries with coords, try Overpass first
    if (isDigitsStreet && hasCoords && digitsStreetMatch?.groups) {
      const num = digitsStreetMatch.groups.num
      const street = digitsStreetMatch.groups.street.trim()
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[AddressAutocomplete] Fetching Overpass addresses (digits+street)', { num, street, userLat, userLng })
      }
      
      fetchOverpassAddresses(num, userLat as number, userLng as number, 2, controller.signal, street)
        .then((response) => {
          if (requestIdRef.current !== currentId) return
          
          // Always log for debugging distance issues
          console.log(`[AddressAutocomplete] Overpass response (digits+street): ok=${response.ok}, dataCount=${response.data?.length || 0}, userCoords=[${userLat}, ${userLng}]`)
          console.log('[AddressAutocomplete] Overpass response (digits+street) details:', {
            ok: response.ok,
            code: response.code,
            dataCount: response.data?.length || 0,
            userCoords: [userLat, userLng],
            debug: response._debug,
            fullResponse: response, // Full response for debugging
            firstResult: response.data?.[0] ? {
              label: response.data[0].label,
              coords: [response.data[0].lat, response.data[0].lng],
              address: response.data[0].address
            } : null
          })
          
          if (response.ok && response.data && response.data.length > 0) {
            // Overpass succeeded
            const unique: AddressSuggestion[] = []
            const seen = new Set<string>()
            for (const s of response.data) {
              const key = s.id
              if (!seen.has(key)) {
                seen.add(key)
                unique.push(s)
              }
            }
            
            // Calculate and log distances for each result
            const withDistances = unique.map(s => {
              const dx = (s.lng - (userLng as number)) * 111320 * Math.cos((s.lat + (userLat as number)) / 2 * Math.PI / 180)
              const dy = (s.lat - (userLat as number)) * 111320
              const distanceM = Math.sqrt(dx * dx + dy * dy)
              return {
                label: s.label,
                coords: [s.lat, s.lng],
                distanceM: Math.round(distanceM),
                distanceKm: (distanceM / 1000).toFixed(2)
              }
            })
            
            // Log first result distance directly for visibility
            if (withDistances.length > 0) {
              console.log(`[AddressAutocomplete] FIRST RESULT (digits+street): "${withDistances[0].label}" - Distance: ${withDistances[0].distanceKm} km (${withDistances[0].distanceM} m)`)
              if (withDistances.length > 1) {
                console.log(`[AddressAutocomplete] SECOND RESULT (digits+street): "${withDistances[1].label}" - Distance: ${withDistances[1].distanceKm} km (${withDistances[1].distanceM} m)`)
              }
            }
            
            console.log('[AddressAutocomplete] Overpass results with distances (digits+street):', {
              count: unique.length,
              results: withDistances,
              rawResults: unique.map(s => ({
                id: s.id,
                label: s.label,
                lat: s.lat,
                lng: s.lng,
                address: s.address
              })),
              debug: response._debug
            })
            
            if (process.env.NODE_ENV === 'development' && unique.length > 0) {
              console.log('[AddressAutocomplete] Received Overpass addresses (digits+street)', { 
                count: unique.length, 
                first: unique[0]?.label,
                all: unique.map(s => ({ label: s.label, lat: s.lat, lng: s.lng })),
                debug: response._debug
              })
            }
            setSuggestions(unique)
            setIsOpen(unique.length > 0)
            setSelectedIndex(-1)
            setShowFallbackMessage(false)
            if (requestIdRef.current === currentId) setIsLoading(false)
          } else {
            // Overpass failed or returned empty - fallback to Nominatim
            console.warn(`[AddressAutocomplete] Overpass failed/empty (digits+street), falling back to Nominatim for "${trimmedQuery}"`)
            return fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
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
                
                // Calculate and log distances for Nominatim fallback results
                const withDistances = unique.map(s => {
                  const dx = (s.lng - (userLng as number)) * 111320 * Math.cos((s.lat + (userLat as number)) / 2 * Math.PI / 180)
                  const dy = (s.lat - (userLat as number)) * 111320
                  const distanceM = Math.sqrt(dx * dx + dy * dy)
                  return {
                    label: s.label,
                    coords: [s.lat, s.lng],
                    distanceM: Math.round(distanceM),
                    distanceKm: (distanceM / 1000).toFixed(2)
                  }
                })
                
                // Sort by distance (Nominatim may not return sorted results)
                withDistances.sort((a, b) => a.distanceM - b.distanceM)
                
                console.log(`[AddressAutocomplete] Nominatim fallback results (digits+street): ${unique.length} results`)
                if (withDistances.length > 0) {
                  console.log(`[AddressAutocomplete] FIRST RESULT (Nominatim fallback): "${withDistances[0].label}" - Distance: ${withDistances[0].distanceKm} km (${withDistances[0].distanceM} m)`)
                  if (withDistances.length > 1) {
                    console.log(`[AddressAutocomplete] SECOND RESULT (Nominatim fallback): "${withDistances[1].label}" - Distance: ${withDistances[1].distanceKm} km (${withDistances[1].distanceM} m)`)
                  }
                }
                
                // Re-sort unique array by distance to match sorted distances
                unique.sort((a, b) => {
                  const distA = withDistances.find(d => d.label === a.label)?.distanceM || Infinity
                  const distB = withDistances.find(d => d.label === b.label)?.distanceM || Infinity
                  return distA - distB
                })
                
                setSuggestions(unique)
                setIsOpen(unique.length > 0)
                setSelectedIndex(-1)
                setShowFallbackMessage(unique.length > 0)
                if (requestIdRef.current === currentId) setIsLoading(false)
              })
          }
        })
        .catch((err) => {
          if (requestIdRef.current !== currentId) return
          if (err?.name === 'AbortError') {
            if (requestIdRef.current === currentId) setIsLoading(false)
            return
          }
          
          // Fallback to Nominatim on error
          fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
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
              setShowFallbackMessage(unique.length > 0)
              if (requestIdRef.current === currentId) setIsLoading(false)
            })
            .catch((fallbackErr) => {
              if (requestIdRef.current !== currentId) return
              if (fallbackErr?.name === 'AbortError') {
                if (requestIdRef.current === currentId) setIsLoading(false)
                return
              }
              console.error('Suggest error:', fallbackErr)
              setSuggestions([])
              setIsOpen(false)
              if (requestIdRef.current === currentId) setIsLoading(false)
            })
        })
    } else if (isNumericOnly && hasCoords) {
      // For numeric-only queries with coords, try Overpass first
      if (process.env.NODE_ENV === 'development') {
        console.log('[AddressAutocomplete] Fetching Overpass addresses', { prefix: trimmedQuery, userLat, userLng })
      }
      
      fetchOverpassAddresses(trimmedQuery, userLat as number, userLng as number, 2, controller.signal)
        .then((response) => {
          if (requestIdRef.current !== currentId) return
          
          // Always log for debugging distance issues
          console.log(`[AddressAutocomplete] Overpass response (numeric-only): ok=${response.ok}, dataCount=${response.data?.length || 0}, userCoords=[${userLat}, ${userLng}], prefix="${trimmedQuery}"`)
          if (response.data?.length === 0) {
            console.warn(`[AddressAutocomplete] Overpass returned 0 results for prefix "${trimmedQuery}" at [${userLat}, ${userLng}] - will fallback to Nominatim`)
          }
          console.log('[AddressAutocomplete] Overpass response (numeric-only) details:', {
            ok: response.ok,
            code: response.code,
            dataCount: response.data?.length || 0,
            userCoords: [userLat, userLng],
            prefix: trimmedQuery,
            debug: response._debug,
            fullResponse: response, // Full response for debugging
            firstResult: response.data?.[0] ? {
              label: response.data[0].label,
              coords: [response.data[0].lat, response.data[0].lng],
              address: response.data[0].address
            } : null
          })
          
          if (response.ok && response.data && response.data.length > 0) {
            // Overpass succeeded
            const unique: AddressSuggestion[] = []
            const seen = new Set<string>()
            for (const s of response.data) {
              const key = s.id
              if (!seen.has(key)) {
                seen.add(key)
                unique.push(s)
              }
            }
            
            // Calculate and log distances for each result
            const withDistances = unique.map(s => {
              const dx = (s.lng - (userLng as number)) * 111320 * Math.cos((s.lat + (userLat as number)) / 2 * Math.PI / 180)
              const dy = (s.lat - (userLat as number)) * 111320
              const distanceM = Math.sqrt(dx * dx + dy * dy)
              return {
                label: s.label,
                coords: [s.lat, s.lng],
                distanceM: Math.round(distanceM),
                distanceKm: (distanceM / 1000).toFixed(2)
              }
            })
            
            // Log first result distance directly for visibility
            if (withDistances.length > 0) {
              console.log(`[AddressAutocomplete] FIRST RESULT (numeric-only): "${withDistances[0].label}" - Distance: ${withDistances[0].distanceKm} km (${withDistances[0].distanceM} m)`)
              if (withDistances.length > 1) {
                console.log(`[AddressAutocomplete] SECOND RESULT (numeric-only): "${withDistances[1].label}" - Distance: ${withDistances[1].distanceKm} km (${withDistances[1].distanceM} m)`)
              }
            }
            
            console.log('[AddressAutocomplete] Overpass results with distances (numeric-only):', {
              count: unique.length,
              results: withDistances,
              rawResults: unique.map(s => ({
                id: s.id,
                label: s.label,
                lat: s.lat,
                lng: s.lng,
                address: s.address
              })),
              debug: response._debug
            })
            
            if (process.env.NODE_ENV === 'development' && unique.length > 0) {
              console.log('[AddressAutocomplete] Received Overpass addresses', { 
                count: unique.length, 
                first: unique[0]?.label,
                all: unique.map(s => ({ label: s.label, lat: s.lat, lng: s.lng })),
                debug: response._debug
              })
            }
            setSuggestions(unique)
            setIsOpen(unique.length > 0)
            setSelectedIndex(-1)
            setShowFallbackMessage(false)
            if (requestIdRef.current === currentId) setIsLoading(false)
          } else {
            // Overpass failed or returned empty - fallback to Nominatim
            console.warn(`[AddressAutocomplete] Overpass failed/empty (numeric-only), falling back to Nominatim for "${trimmedQuery}"`)
            return fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
              .then((results) => {
                if (requestIdRef.current !== currentId) return
                const unique: AddressSuggestion[] = []
                const seen = new Set<string>()
                
                // For numeric-only queries, filter to only include actual street addresses (with house_number)
                // This prevents irrelevant results like "Devils Campground Interpretive Trail" with "5001" in the name
                const filtered = results.filter(s => {
                  // Only include results that have a house_number in the address
                  // This ensures we're showing actual street addresses, not just places with the number in the name
                  return s.address?.houseNumber || s.label.match(/^\d+\s+[A-Za-z]/) // Match pattern like "5001 Main St"
                })
                
                for (const s of filtered) {
                  const key = s.id
                  if (!seen.has(key)) {
                    seen.add(key)
                    unique.push(s)
                  }
                }
                
                // Calculate and log distances for Nominatim fallback results
                const withDistances = unique.map(s => {
                  const dx = (s.lng - (userLng as number)) * 111320 * Math.cos((s.lat + (userLat as number)) / 2 * Math.PI / 180)
                  const dy = (s.lat - (userLat as number)) * 111320
                  const distanceM = Math.sqrt(dx * dx + dy * dy)
                  return {
                    label: s.label,
                    coords: [s.lat, s.lng],
                    distanceM: Math.round(distanceM),
                    distanceKm: (distanceM / 1000).toFixed(2)
                  }
                })
                
                // Sort by distance (Nominatim may not return sorted results)
                withDistances.sort((a, b) => a.distanceM - b.distanceM)
                
                console.log(`[AddressAutocomplete] Nominatim fallback results (numeric-only): ${unique.length} results (filtered from ${results.length} total)`)
                if (withDistances.length > 0) {
                  console.log(`[AddressAutocomplete] FIRST RESULT (Nominatim fallback): "${withDistances[0].label}" - Distance: ${withDistances[0].distanceKm} km (${withDistances[0].distanceM} m)`)
                  if (withDistances.length > 1) {
                    console.log(`[AddressAutocomplete] SECOND RESULT (Nominatim fallback): "${withDistances[1].label}" - Distance: ${withDistances[1].distanceKm} km (${withDistances[1].distanceM} m)`)
                  }
                } else {
                  console.warn(`[AddressAutocomplete] No valid street addresses found in Nominatim results for "${trimmedQuery}"`)
                }
                
                // Re-sort unique array by distance to match sorted distances
                unique.sort((a, b) => {
                  const distA = withDistances.find(d => d.label === a.label)?.distanceM || Infinity
                  const distB = withDistances.find(d => d.label === b.label)?.distanceM || Infinity
                  return distA - distB
                })
                
                setSuggestions(unique)
                setIsOpen(unique.length > 0)
                setSelectedIndex(-1)
                setShowFallbackMessage(unique.length > 0) // Show message if we got results from fallback
                if (requestIdRef.current === currentId) setIsLoading(false)
              })
          }
        })
        .catch((err) => {
          if (requestIdRef.current !== currentId) return
          if (err?.name === 'AbortError') {
            if (requestIdRef.current === currentId) setIsLoading(false)
            return
          }
          
          // Fallback to Nominatim on error
          fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
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
              setShowFallbackMessage(unique.length > 0)
              if (requestIdRef.current === currentId) setIsLoading(false)
            })
            .catch((fallbackErr) => {
              if (requestIdRef.current !== currentId) return
              if (fallbackErr?.name === 'AbortError') {
                if (requestIdRef.current === currentId) setIsLoading(false)
                return
              }
              console.error('Suggest error:', fallbackErr)
              setSuggestions([])
              setIsOpen(false)
              if (requestIdRef.current === currentId) setIsLoading(false)
            })
        })
    } else {
      // Use Nominatim for non-numeric or when coords not available
      if (process.env.NODE_ENV === 'development') {
        console.log('[AddressAutocomplete] Fetching suggestions', { query: trimmedQuery.substring(0, 20), userLat, userLng })
      }
      fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
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
    }
  }, [debouncedQuery, userLat, userLng])

  // If last fetch lacked coords and coords arrive, abort stale request and refetch with coords
  useEffect(() => {
    const trimmedQuery = debouncedQuery?.trim() || ''
    const isNumericOnly = /^\d{1,6}$/.test(trimmedQuery)
    const digitsStreetMatch = trimmedQuery.match(/^(?<num>\d{1,8})\s+(?<street>[A-Za-z].+)$/)
    const isDigitsStreet = digitsStreetMatch !== null
    const minLength = isNumericOnly ? 1 : 2
    
    if (!trimmedQuery || trimmedQuery.length < minLength) return
    if (!userLat || !userLng) return
    if (lastHadCoordsRef.current) return
    
    const currentId = ++requestIdRef.current
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setShowFallbackMessage(false)
    
    // For digits+street queries, use Overpass with street parameter
    if (isDigitsStreet && digitsStreetMatch?.groups) {
      const num = digitsStreetMatch.groups.num
      const street = digitsStreetMatch.groups.street.trim()
      
      fetchOverpassAddresses(num, userLat, userLng, 2, controller.signal, street)
        .then((response) => {
          if (requestIdRef.current !== currentId) return
          if (response.ok && response.data && response.data.length > 0) {
            const unique: AddressSuggestion[] = []
            const seen = new Set<string>()
            for (const s of response.data) {
              const key = s.id
              if (!seen.has(key)) {
                seen.add(key)
                unique.push(s)
              }
            }
            setSuggestions(unique)
            setIsOpen(unique.length > 0)
            setSelectedIndex(-1)
            setShowFallbackMessage(false)
          } else {
            // Fallback to Nominatim
            return fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
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
                setShowFallbackMessage(unique.length > 0)
              })
          }
        })
        .catch(() => {
          // Fallback to Nominatim on error
          fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
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
              setShowFallbackMessage(unique.length > 0)
            })
            .catch(() => {})
        })
        .finally(() => setIsLoading(false))
    } else if (isNumericOnly) {
      // For numeric-only queries, use Overpass; otherwise use Nominatim
      fetchOverpassAddresses(trimmedQuery, userLat, userLng, 2, controller.signal)
        .then((response) => {
          if (requestIdRef.current !== currentId) return
          if (response.ok && response.data && response.data.length > 0) {
            const unique: AddressSuggestion[] = []
            const seen = new Set<string>()
            for (const s of response.data) {
              const key = s.id
              if (!seen.has(key)) {
                seen.add(key)
                unique.push(s)
              }
            }
            setSuggestions(unique)
            setIsOpen(unique.length > 0)
            setSelectedIndex(-1)
            setShowFallbackMessage(false)
          } else {
            // Fallback to Nominatim
            return fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
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
                setShowFallbackMessage(unique.length > 0)
              })
          }
        })
        .catch(() => {
          // Fallback to Nominatim on error
          fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
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
              setShowFallbackMessage(unique.length > 0)
            })
            .catch(() => {})
        })
        .finally(() => setIsLoading(false))
    } else {
      fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
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
          setShowFallbackMessage(false)
        })
        .catch(() => {})
        .finally(() => setIsLoading(false))
    }
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
      const trimmedValue = value?.trim() || ''
      const isNumericOnly = /^\d{1,6}$/.test(trimmedValue)
      const minLength = isNumericOnly ? 1 : 2
      if (e.key === 'Enter' && value.length >= minLength) {
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
    const trimmedQuery = debouncedQuery?.trim() || ''
    const isNumericOnly = /^\d{1,6}$/.test(trimmedQuery)
    const minLength = isNumericOnly ? 1 : 2
    if (trimmedQuery && trimmedQuery.length >= minLength && suggestions.length > 0) {
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
        
        {(() => {
          const trimmedValue = value?.trim() || ''
          const isNumericOnly = /^\d{1,6}$/.test(trimmedValue)
          const minLength = isNumericOnly ? 1 : 2
          if (value && value.length < minLength && !error) {
            return <p className="mt-1 text-xs text-gray-500">Type at least {minLength} {minLength === 1 ? 'character' : 'characters'}</p>
          }
          return null
        })()}
        
        {isGeocoding && (
          <p className="mt-1 text-xs text-gray-500">Looking up address...</p>
        )}

        {isLoading && ((() => {
          const trimmedValue = value?.trim() || ''
          const isNumericOnly = /^\d{1,6}$/.test(trimmedValue)
          const minLength = isNumericOnly ? 1 : 2
          return value.length >= minLength
        })()) && (
          <p className="mt-1 text-xs text-gray-500">Searching...</p>
        )}

        {/* Fallback message */}
        {showFallbackMessage && !isLoading && suggestions.length > 0 && (
          <p className="mt-1 text-xs text-gray-500 italic">Showing broader matches—add a street name for more precise results.</p>
        )}

        {/* No results state */}
        {!isLoading && (() => {
          const trimmedValue = value?.trim() || ''
          const isNumericOnly = /^\d{1,6}$/.test(trimmedValue)
          const minLength = isNumericOnly ? 1 : 2
          return value.length >= minLength && debouncedQuery.length >= minLength && !isOpen && suggestions.length === 0 && !error
        })() && (
          <p className="mt-1 text-xs text-gray-500">No results found</p>
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
