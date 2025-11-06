'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { geocodeAddress, fetchSuggestions, fetchOverpassAddresses, AddressSuggestion } from '@/lib/geocode'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { haversineMeters } from '@/lib/geo/distance'
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
  // Helper function to sort suggestions by distance
  const sortByDistance = useCallback((suggestions: AddressSuggestion[], lat?: number, lng?: number): AddressSuggestion[] => {
    if (!lat || !lng) return suggestions
    return [...suggestions].sort((a, b) => {
      const distA = haversineMeters(lat, lng, a.lat, a.lng)
      const distB = haversineMeters(lat, lng, b.lat, b.lng)
      return distA - distB
    })
  }, [])
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

  // Use location from props if provided, otherwise try browser geolocation first (high accuracy), then IP geolocation
  useEffect(() => {
    if (propUserLat && propUserLng) {
      // Location provided via props (from server-side) - use it directly
      setUserLat(propUserLat)
      setUserLng(propUserLng)
      geoWaitRef.current = false
    } else {
      // No props provided - use IP geolocation only (never prompt the user)
      geoWaitRef.current = true
      fetch('/api/geolocation/ip')
        .then(res => res.ok ? res.json() : null)
        .then(ipData => {
          if (ipData?.lat && ipData?.lng) {
            console.log('[AddressAutocomplete] Using IP geolocation:', { lat: ipData.lat, lng: ipData.lng, source: ipData.source })
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
    
    console.log(`[AddressAutocomplete] Query processing: "${trimmedQuery}" (length: ${trimmedQuery.length}, minLength: ${minLength}, isNumericOnly: ${isNumericOnly}, isDigitsStreet: ${isDigitsStreet}, hasCoords: ${hasCoords})`)
    
    if (!trimmedQuery || trimmedQuery.length < minLength) {
      console.log(`[AddressAutocomplete] Query too short: "${trimmedQuery}" (length: ${trimmedQuery.length} < ${minLength})`)
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
      if (process.env.NODE_ENV === 'development') {
        console.log('[AddressAutocomplete] Fetching Overpass addresses (digits+street)', { q: trimmedQuery, userLat, userLng })
      }
      
      fetchOverpassAddresses(trimmedQuery, userLat as number, userLng as number, 2, controller.signal)
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
            
            // Calculate distances and sort by distance (closest first)
            const withDistances = unique.map(s => {
              const dx = (s.lng - (userLng as number)) * 111320 * Math.cos((s.lat + (userLat as number)) / 2 * Math.PI / 180)
              const dy = (s.lat - (userLat as number)) * 111320
              const distanceM = Math.sqrt(dx * dx + dy * dy)
              return {
                suggestion: s,
                distanceM: distanceM,
                distanceKm: (distanceM / 1000).toFixed(2)
              }
            })
            
            // Sort by distance (closest first)
            withDistances.sort((a, b) => a.distanceM - b.distanceM)
            
            // Extract sorted suggestions
            const sortedUnique = withDistances.map(item => item.suggestion)
            
            // Log first result distance directly for visibility
            if (withDistances.length > 0) {
              console.log(`[AddressAutocomplete] FIRST RESULT (digits+street): "${withDistances[0].suggestion.label}" - Distance: ${withDistances[0].distanceKm} km (${Math.round(withDistances[0].distanceM)} m)`)
              if (withDistances.length > 1) {
                console.log(`[AddressAutocomplete] SECOND RESULT (digits+street): "${withDistances[1].suggestion.label}" - Distance: ${withDistances[1].distanceKm} km (${Math.round(withDistances[1].distanceM)} m)`)
              }
            }
            
            console.log('[AddressAutocomplete] Overpass results with distances (digits+street, sorted):', {
              count: sortedUnique.length,
              results: withDistances.map(item => ({
                label: item.suggestion.label,
                coords: [item.suggestion.lat, item.suggestion.lng],
                distanceM: Math.round(item.distanceM),
                distanceKm: item.distanceKm
              })),
              rawResults: sortedUnique.map(s => ({
                id: s.id,
                label: s.label,
                lat: s.lat,
                lng: s.lng,
                address: s.address
              })),
              debug: response._debug
            })
            
            if (process.env.NODE_ENV === 'development' && sortedUnique.length > 0) {
              console.log('[AddressAutocomplete] Received Overpass addresses (digits+street, sorted by distance)', {
                count: sortedUnique.length,
                first: sortedUnique[0]?.label,
                all: sortedUnique.map(s => ({ label: s.label, lat: s.lat, lng: s.lng })),
                debug: response._debug
              })
            }
            setSuggestions(sortedUnique)
            setIsOpen(sortedUnique.length > 0)
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
                // Filter to only actual street addresses (with house number or matching street pattern)
                const filteredUnique = unique.filter(s => {
                  // Include if it has a house number
                  if (s.address?.houseNumber) return true
                  // Include if label matches pattern like "5001 Main St" or starts with number
                  if (s.label.match(/^\d+\s+[A-Za-z]/)) return true
                  // Include if it has a road and label starts with number
                  if (s.address?.road && s.label.match(/^\d+/)) return true
                  return false
                })
                
                // Recalculate distances for filtered results
                const filteredWithDistances = filteredUnique.map(s => {
                  const dx = (s.lng - (userLng as number)) * 111320 * Math.cos((s.lat + (userLat as number)) / 2 * Math.PI / 180)
                  const dy = (s.lat - (userLat as number)) * 111320
                  const distanceM = Math.sqrt(dx * dx + dy * dy)
                  return {
                    suggestion: s,
                    distanceM: distanceM,
                    distanceKm: (distanceM / 1000).toFixed(2)
                  }
                })
                
                // Sort by distance (closest first)
                filteredWithDistances.sort((a, b) => a.distanceM - b.distanceM)
                
                console.log(`[AddressAutocomplete] Nominatim fallback results (digits+street): ${unique.length} total, ${filteredUnique.length} after filtering`)
                if (filteredWithDistances.length > 0) {
                  console.log(`[AddressAutocomplete] FIRST RESULT (Nominatim fallback): "${filteredWithDistances[0].suggestion.label}" - Distance: ${filteredWithDistances[0].distanceKm} km (${Math.round(filteredWithDistances[0].distanceM)} m)`)
                  if (filteredWithDistances.length > 1) {
                    console.log(`[AddressAutocomplete] SECOND RESULT (Nominatim fallback): "${filteredWithDistances[1].suggestion.label}" - Distance: ${filteredWithDistances[1].distanceKm} km (${Math.round(filteredWithDistances[1].distanceM)} m)`)
                  }
                }
                
                // Extract sorted suggestions
                const sortedUnique = filteredWithDistances.map(item => item.suggestion)
                
                setSuggestions(sortedUnique)
                setIsOpen(sortedUnique.length > 0)
                setSelectedIndex(-1)
                setShowFallbackMessage(sortedUnique.length > 0)
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
            
            // Calculate distances and sort by distance (closest first)
            const withDistances = unique.map(s => {
              const dx = (s.lng - (userLng as number)) * 111320 * Math.cos((s.lat + (userLat as number)) / 2 * Math.PI / 180)
              const dy = (s.lat - (userLat as number)) * 111320
              const distanceM = Math.sqrt(dx * dx + dy * dy)
              return {
                suggestion: s,
                distanceM: distanceM,
                distanceKm: (distanceM / 1000).toFixed(2)
              }
            })
            
            // Sort by distance (closest first)
            withDistances.sort((a, b) => a.distanceM - b.distanceM)
            
            // Extract sorted suggestions
            const sortedUnique = withDistances.map(item => item.suggestion)
            
            // Log first result distance directly for visibility
            if (withDistances.length > 0) {
              console.log(`[AddressAutocomplete] FIRST RESULT (numeric-only): "${withDistances[0].suggestion.label}" - Distance: ${withDistances[0].distanceKm} km (${Math.round(withDistances[0].distanceM)} m)`)
              if (withDistances.length > 1) {
                console.log(`[AddressAutocomplete] SECOND RESULT (numeric-only): "${withDistances[1].suggestion.label}" - Distance: ${withDistances[1].distanceKm} km (${Math.round(withDistances[1].distanceM)} m)`)
              }
            }
            
            console.log('[AddressAutocomplete] Overpass results with distances (numeric-only, sorted):', {
              count: sortedUnique.length,
              results: withDistances.map(item => ({
                label: item.suggestion.label,
                coords: [item.suggestion.lat, item.suggestion.lng],
                distanceM: Math.round(item.distanceM),
                distanceKm: item.distanceKm
              })),
              rawResults: sortedUnique.map(s => ({
                id: s.id,
                label: s.label,
                lat: s.lat,
                lng: s.lng,
                address: s.address
              })),
              debug: response._debug
            })
            
            if (process.env.NODE_ENV === 'development' && sortedUnique.length > 0) {
              console.log('[AddressAutocomplete] Received Overpass addresses (sorted by distance)', { 
                count: sortedUnique.length, 
                first: sortedUnique[0]?.label,
                all: sortedUnique.map(s => ({ label: s.label, lat: s.lat, lng: s.lng })),
                debug: response._debug
              })
            }
            setSuggestions(sortedUnique)
            setIsOpen(sortedUnique.length > 0)
            setSelectedIndex(-1)
            setShowFallbackMessage(false)
            if (requestIdRef.current === currentId) setIsLoading(false)
          } else {
            // Overpass failed or returned empty
            // For numeric-only queries, don't fallback to Nominatim because free-text search
            // for just a number returns irrelevant results (places with the number in the name, not addresses)
            console.warn(`[AddressAutocomplete] Overpass returned 0 results for numeric-only query "${trimmedQuery}" - showing no results (Nominatim fallback disabled for numeric-only queries)`)
            setSuggestions([])
            setIsOpen(false)
            setShowFallbackMessage(false)
            if (requestIdRef.current === currentId) setIsLoading(false)
            return
          }
        })
        .catch((err) => {
          if (requestIdRef.current !== currentId) return
          if (err?.name === 'AbortError') {
            if (requestIdRef.current === currentId) setIsLoading(false)
            return
          }
          
          // On error, also don't fallback for numeric-only queries
          console.warn(`[AddressAutocomplete] Overpass error for numeric-only query "${trimmedQuery}" - showing no results`)
          setSuggestions([])
          setIsOpen(false)
          if (requestIdRef.current === currentId) setIsLoading(false)
        })
      } else {
        // For non-numeric queries, use Nominatim directly (existing behavior)
        console.log(`[AddressAutocomplete] Fetching Nominatim suggestions for non-numeric query: "${trimmedQuery.substring(0, 30)}"`, { userLat, userLng, hasCoords: !!userLat && !!userLng })
        fetchSuggestions(trimmedQuery, userLat, userLng, controller.signal)
          .then((results) => {
            if (requestIdRef.current !== currentId) return
            console.log(`[AddressAutocomplete] Nominatim returned ${results.length} results for "${trimmedQuery.substring(0, 30)}"`)
            const unique: AddressSuggestion[] = []
            const seen = new Set<string>()
            for (const s of results) {
              const key = s.id
              if (!seen.has(key)) {
                seen.add(key)
                unique.push(s)
              }
            }
            console.log(`[AddressAutocomplete] Nominatim unique results: ${unique.length} (after deduplication)`)
            if (unique.length > 0) {
              console.log(`[AddressAutocomplete] FIRST RESULT (Nominatim): "${unique[0]?.label}"`)
            }
            setSuggestions(unique)
            setIsOpen(unique.length > 0)
            setSelectedIndex(-1)
            setShowFallbackMessage(false)
          })
          .catch((err) => {
            if (requestIdRef.current !== currentId) return
            if (err?.name === 'AbortError') return
            console.error(`[AddressAutocomplete] Nominatim error for "${trimmedQuery.substring(0, 30)}":`, err)
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
    
    // For digits+street queries, use Overpass with full query string
    if (isDigitsStreet && digitsStreetMatch?.groups) {
      fetchOverpassAddresses(trimmedQuery, userLat as number, userLng as number, 2, controller.signal)
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
                // Sort by distance for digits+street mode
                const sorted = sortByDistance(unique, userLat, userLng)
                setSuggestions(sorted)
                setIsOpen(sorted.length > 0)
                setSelectedIndex(-1)
                setShowFallbackMessage(sorted.length > 0)
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
              // Sort by distance for digits+street mode
              const sorted = sortByDistance(unique, userLat, userLng)
              setSuggestions(sorted)
              setIsOpen(sorted.length > 0)
              setSelectedIndex(-1)
              setShowFallbackMessage(sorted.length > 0)
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
                // Sort by distance for numeric-only mode
                const sorted = sortByDistance(unique, userLat, userLng)
                setSuggestions(sorted)
                setIsOpen(sorted.length > 0)
                setSelectedIndex(-1)
                setShowFallbackMessage(sorted.length > 0)
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
              // Sort by distance for numeric-only mode
              const sorted = sortByDistance(unique, userLat, userLng)
              setSuggestions(sorted)
              setIsOpen(sorted.length > 0)
              setSelectedIndex(-1)
              setShowFallbackMessage(sorted.length > 0)
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
                {suggestion.address && (() => {
                  // Build address string from components
                  const addressString = [
                    suggestion.address.houseNumber,
                    suggestion.address.road,
                    suggestion.address.city,
                    suggestion.address.state,
                    suggestion.address.postcode
                  ]
                    .filter(Boolean)
                    .join(', ')
                  
                  // Only show secondary line if it's different from the label
                  if (addressString && addressString !== suggestion.label) {
                    return (
                      <div className="text-xs text-gray-500">
                        {addressString}
                      </div>
                    )
                  }
                  return null
                })()}
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
