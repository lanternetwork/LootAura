'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { geocodeAddress, fetchSuggestions, fetchOverpassAddresses, AddressSuggestion } from '@/lib/geocode'
import { googleAutocomplete, googlePlaceDetails } from '@/lib/providers/googlePlaces'
import PoweredBy from './PoweredBy'
// Generate session tokens using Web Crypto if available
function newSessionToken(): string {
  try {
    // @ts-ignore
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      // @ts-ignore
      return crypto.randomUUID()
    }
  } catch {}
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
import { useDebounce } from '@/lib/hooks/useDebounce'
import { haversineMeters } from '@/lib/geo/distance'
import OSMAttribution from './OSMAttribution'

// Convert US state name to abbreviation
function normalizeState(state: string): string {
  if (!state) return state
  const stateUpper = state.toUpperCase().trim()
  
  // If already 2 letters, assume it's already an abbreviation
  if (stateUpper.length === 2) return stateUpper
  
  // Map of common state names to abbreviations
  const stateMap: Record<string, string> = {
    'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
    'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
    'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
    'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
    'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
    'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
    'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
    'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY',
    'DISTRICT OF COLUMBIA': 'DC', 'D.C.': 'DC', 'DC': 'DC'
  }
  
  return stateMap[stateUpper] || state // Return abbreviation if found, otherwise return original
}

// Helper function to handle Overpass address lookup with optional fallback
// This function uses async/await to avoid nested promise chains that confuse TypeScript parser
async function handleOverpassLookup(
  query: string,
  userLat: number | undefined,
  userLng: number | undefined,
  currentRequestId: number,
  requestIdRef: React.MutableRefObject<number>,
  abortSignal: AbortSignal,
  setIsLoading: (loading: boolean) => void,
  setSuggestions: (suggestions: AddressSuggestion[]) => void,
  setIsOpen: (open: boolean) => void,
  setSelectedIndex: (index: number) => void,
  setShowFallbackMessage: (show: boolean) => void,
  enableFallback: boolean = true // For digits+street: true, for numeric-only: false
): Promise<void> {
  try {
    // Check if request was cancelled before starting
    if (requestIdRef.current !== currentRequestId) return

    // Call Overpass
    const response = await fetchOverpassAddresses(
      query,
      userLat as number,
      userLng as number,
      2,
      abortSignal
    )

    // Check if request was cancelled after Overpass call
    if (requestIdRef.current !== currentRequestId) return

    // Log for debugging (debug only)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const queryType = enableFallback ? 'digits+street' : 'numeric-only'
      console.log(`[DEBUG] [AddressAutocomplete] Overpass response (${queryType}): ok=${response.ok}, dataCount=${response.data?.length || 0}, userCoords=[${userLat}, ${userLng}]`)
      if (queryType === 'digits+street') {
        console.log('[DEBUG] [AddressAutocomplete] Overpass response (digits+street) details:', {
          ok: response.ok,
          code: response.code,
          dataCount: response.data?.length || 0,
          userCoords: [userLat, userLng],
          debug: response._debug,
          fullResponse: response,
          firstResult: response.data?.[0] ? {
            label: response.data[0].label,
            coords: [response.data[0].lat, response.data[0].lng],
            address: response.data[0].address
          } : null
        })
      } else {
        if (response.data?.length === 0) {
          console.warn(`[DEBUG] [AddressAutocomplete] Overpass returned 0 results for prefix "${query}" at [${userLat}, ${userLng}] - will fallback to Nominatim`)
        }
        console.log('[DEBUG] [AddressAutocomplete] Overpass response (numeric-only) details:', {
          ok: response.ok,
          code: response.code,
          dataCount: response.data?.length || 0,
          userCoords: [userLat, userLng],
          prefix: query,
          debug: response._debug,
          fullResponse: response,
          firstResult: response.data?.[0] ? {
            label: response.data[0].label,
            coords: [response.data[0].lat, response.data[0].lng],
            address: response.data[0].address
          } : null
        })
      }
    }

    // If Overpass succeeded with results
    if (response.ok && response.data && response.data.length > 0) {
      // Deduplicate
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

      // Log first result distance
      if (withDistances.length > 0) {
        const queryType = enableFallback ? 'digits+street' : 'numeric-only'
        if (queryType === 'digits+street') {
          console.log(`[AddressAutocomplete] FIRST RESULT (digits+street): "${withDistances[0].suggestion.label}" - Distance: ${withDistances[0].distanceKm} km (${Math.round(withDistances[0].distanceM)} m)`)
          if (withDistances.length > 1) {
            console.log(`[AddressAutocomplete] SECOND RESULT (digits+street): "${withDistances[1].suggestion.label}" - Distance: ${withDistances[1].distanceKm} km (${Math.round(withDistances[1].distanceM)} m)`)
          }
        } else if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log(`[DEBUG] [AddressAutocomplete] FIRST RESULT (numeric-only): "${withDistances[0].suggestion.label}" - Distance: ${withDistances[0].distanceKm} km (${Math.round(withDistances[0].distanceM)} m)`)
          if (withDistances.length > 1) {
            console.log(`[DEBUG] [AddressAutocomplete] SECOND RESULT (numeric-only): "${withDistances[1].suggestion.label}" - Distance: ${withDistances[1].distanceKm} km (${Math.round(withDistances[1].distanceM)} m)`)
          }
        }
      }

      // Log detailed results
      if (enableFallback) {
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
      } else if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[DEBUG] [AddressAutocomplete] Overpass results with distances (numeric-only, sorted):', {
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

        if (sortedUnique.length > 0) {
          console.log('[DEBUG] [AddressAutocomplete] Received Overpass addresses (sorted by distance)', {
            count: sortedUnique.length,
            first: sortedUnique[0]?.label,
            all: sortedUnique.map(s => ({ label: s.label, lat: s.lat, lng: s.lng })),
            debug: response._debug
          })
        }
      }

      // Update state
      if (requestIdRef.current === currentRequestId) {
        setSuggestions(sortedUnique)
        setIsOpen(sortedUnique.length > 0)
        setSelectedIndex(-1)
        setShowFallbackMessage(false)
        setIsLoading(false)
      }
      return
    }

    // Overpass failed or returned empty
    if (enableFallback) {
      // For digits+street: fallback to Nominatim
      console.warn(`[AddressAutocomplete] Overpass failed/empty (digits+street), falling back to Nominatim for "${query}"`)
      
      try {
        const results = await fetchSuggestions(query, userLat, userLng, abortSignal)

        // Check if request was cancelled after fallback call
        if (requestIdRef.current !== currentRequestId) return

        // Deduplicate
        const unique: AddressSuggestion[] = []
        const seen = new Set<string>()
        for (const s of results) {
          const key = s.id
          if (!seen.has(key)) {
            seen.add(key)
            unique.push(s)
          }
        }

        // Filter to only actual street addresses (with house number or matching street pattern)
        // For very short street inputs (e.g., 'pr'), skip aggressive filtering to avoid losing valid results
        const streetInput = (query.match(/^\d+\s+(.+)$/)?.[1] || '').trim()
        const isShortStreet = streetInput.length > 0 && streetInput.length < 3
        const filteredUnique = (isShortStreet ? unique : unique.filter(s => {
          // Include if it has a house number
          if (s.address?.houseNumber) return true
          // Include if label matches pattern like "5001 Main St" or starts with number
          if (s.label.match(/^\d+\s+[A-Za-z]/)) return true
          // Include if it has a road and label starts with number
          if (s.address?.road && s.label.match(/^\d+/)) return true
          return false
        }))

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

        // Filter by maximum distance (50km) to avoid showing results thousands of km away
        const MAX_DISTANCE_M = 50 * 1000 // 50km
        const withinDistance = filteredWithDistances.filter(item => item.distanceM <= MAX_DISTANCE_M)

        console.log(`[AddressAutocomplete] Nominatim fallback results (digits+street): ${unique.length} total, ${filteredUnique.length} after filtering, ${withinDistance.length} within 50km`)
        if (withinDistance.length > 0) {
          console.log(`[AddressAutocomplete] FIRST RESULT (Nominatim fallback): "${withinDistance[0].suggestion.label}" - Distance: ${withinDistance[0].distanceKm} km (${Math.round(withinDistance[0].distanceM)} m)`)
          if (withinDistance.length > 1) {
            console.log(`[AddressAutocomplete] SECOND RESULT (Nominatim fallback): "${withinDistance[1].suggestion.label}" - Distance: ${withinDistance[1].distanceKm} km (${Math.round(withinDistance[1].distanceM)} m)`)
          }
        } else if (filteredWithDistances.length > 0) {
          console.warn(`[AddressAutocomplete] All Nominatim results are >50km away. Closest: "${filteredWithDistances[0].suggestion.label}" at ${filteredWithDistances[0].distanceKm} km`)
        }

        // Extract sorted suggestions (only within distance)
        const sortedUnique = withinDistance.map(item => item.suggestion)

        // Update state
        if (requestIdRef.current === currentRequestId) {
          setSuggestions(sortedUnique)
          setIsOpen(sortedUnique.length > 0)
          setSelectedIndex(-1)
          setShowFallbackMessage(sortedUnique.length > 0)
          setIsLoading(false)
        }
      } catch (fallbackErr) {
        // Silently handle errors in fallback
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[DEBUG] [AddressAutocomplete] Nominatim fallback failed silently')
        }
        // Clear loading if request still matches
        if (requestIdRef.current === currentRequestId) {
          setIsLoading(false)
        }
      }
    } else {
      // For numeric-only: don't fallback, just show no results
      console.warn(`[AddressAutocomplete] Overpass returned 0 results for numeric-only query "${query}" - showing no results (Nominatim fallback disabled for numeric-only queries)`)
      if (requestIdRef.current === currentRequestId) {
        setSuggestions([])
        setIsOpen(false)
        setShowFallbackMessage(false)
        setIsLoading(false)
      }
    }
  } catch (err: any) {
    // Handle outer errors (Overpass call failed)
    if (requestIdRef.current !== currentRequestId) return
    
    if (err?.name === 'AbortError') {
      if (requestIdRef.current === currentRequestId) setIsLoading(false)
      return
    }

    // For digits+street: fallback to Nominatim on error
    if (enableFallback) {
      try {
        const results = await fetchSuggestions(query, userLat, userLng, abortSignal)

        // Check if request was cancelled after fallback call
        if (requestIdRef.current !== currentRequestId) return

        // Deduplicate
        const unique: AddressSuggestion[] = []
        const seen = new Set<string>()
        for (const s of results) {
          const key = s.id
          if (!seen.has(key)) {
            seen.add(key)
            unique.push(s)
          }
        }

        // Update state
        if (requestIdRef.current === currentRequestId) {
          setSuggestions(unique)
          setIsOpen(unique.length > 0)
          setSelectedIndex(-1)
          setShowFallbackMessage(unique.length > 0)
          setIsLoading(false)
        }
      } catch (fallbackErr: any) {
        if (requestIdRef.current !== currentRequestId) return
        if (fallbackErr?.name === 'AbortError') {
          if (requestIdRef.current === currentRequestId) setIsLoading(false)
          return
        }
        // Final error - log and clear loading
        console.error('Suggest error:', fallbackErr)
        if (requestIdRef.current === currentRequestId) {
          setSuggestions([])
          setIsOpen(false)
          setIsLoading(false)
        }
      }
    } else {
      // For numeric-only: log warning and clear loading on error
      console.warn(`[AddressAutocomplete] Overpass error for numeric-only query "${query}" - showing no results`)
      if (requestIdRef.current === currentRequestId) {
        setSuggestions([])
        setIsOpen(false)
        setIsLoading(false)
      }
    }
  }
}

interface AddressAutocompleteProps {
  value: string
  onChange: (address: string) => void
  onPlaceSelected?: (place: {
    address: string
    city?: string
    state?: string
    zip?: string
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
  const [googleSessionToken, setGoogleSessionToken] = useState<string | null>(null)
  const [showGoogleAttribution, setShowGoogleAttribution] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastHadCoordsRef = useRef<boolean>(false)
  const requestIdRef = useRef(0)
  const geoWaitRef = useRef<boolean>(false)
  const suppressNextFetchRef = useRef<boolean>(false)
  const justSelectedRef = useRef<boolean>(false)
  const [hasJustSelected, setHasJustSelected] = useState(false)
  const [isSuppressing, setIsSuppressing] = useState(false) // State version for JSX render
  const lastSelectedAddressRef = useRef<string | null>(null) // Track last selected address to prevent re-searching
  const lastSelectionTimestampRef = useRef<number>(0) // Track when place was selected to prevent stale searches
  const isInitialMountRef = useRef<boolean>(true)
  // Capture initial value synchronously on first render (before debounce triggers)
  const initialValueRef = useRef<string | undefined>(value && value.trim().length > 0 ? value.trim() : undefined)
  const hasUserInteractedRef = useRef<boolean>(false)
  const hasSuppressedInitialSearchRef = useRef<boolean>(false)

  // Update initial value ref if value changes before user interaction (for programmatic updates)
  // Also ensure we capture the trimmed value for consistent comparison
  useEffect(() => {
    if (isInitialMountRef.current && !hasUserInteractedRef.current && value && value.trim().length > 0) {
      const trimmedValue = value.trim()
      if (initialValueRef.current === undefined) {
        initialValueRef.current = trimmedValue
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[AddressAutocomplete] Captured initial value (late):', trimmedValue)
        }
      } else if (initialValueRef.current !== trimmedValue) {
        // If the value changed programmatically (e.g., from props), update the initial value
        // This handles cases where the component receives a new initial value
        initialValueRef.current = trimmedValue
        hasSuppressedInitialSearchRef.current = false // Reset suppression flag
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[AddressAutocomplete] Updated initial value:', trimmedValue)
        }
      }
    }
  }, [value])

  // Debounce search query (250ms per spec to avoid "empty flashes")
  const debouncedQuery = useDebounce(value, 250)

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
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[AddressAutocomplete] Using IP geolocation:', { lat: ipData.lat, lng: ipData.lng, source: ipData.source })
            }
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

  // (session token creation handled inside handleFocus; reset in handleBlur)

  // Fetch suggestions when query changes
  useEffect(() => {
    const trimmedQuery = debouncedQuery?.trim() || ''
    const currentValueTrimmed = value?.trim() || ''

    // EARLY RETURN: Suppress search if there's an initial value and user hasn't interacted (edit mode)
    // This prevents the dropdown from appearing when the page loads with an existing address
    // Check both current value and debounced query to catch all cases
    // This must be the FIRST check to prevent any fetch from starting
    if (!hasUserInteractedRef.current) {
      if (initialValueRef.current && initialValueRef.current.length > 0) {
        const initialTrimmed = initialValueRef.current
        // Suppress if current value or debounced query matches initial value (all trimmed for consistency)
        const matchesInitial = 
          currentValueTrimmed === initialTrimmed || 
          trimmedQuery === initialTrimmed
        
        if (matchesInitial) {
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[AddressAutocomplete] Suppressing search - value matches initial:', {
              initial: initialValueRef.current,
              current: value,
              currentTrimmed: currentValueTrimmed,
              debounced: trimmedQuery,
              hasSuppressed: hasSuppressedInitialSearchRef.current
            })
          }
          // Abort any in-flight requests
          if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
          }
          hasSuppressedInitialSearchRef.current = true
          isInitialMountRef.current = false
          setIsLoading(false)
          setIsOpen(false)
          setShowGoogleAttribution(false)
          setShowFallbackMessage(false)
          setSuggestions([]) // Clear any existing suggestions
          return // EARLY RETURN - don't proceed with any fetch logic
        }
      }
    }
    
    // If we've already suppressed and value still matches initial, don't search
    if (hasSuppressedInitialSearchRef.current && initialValueRef.current) {
      const initialTrimmed = initialValueRef.current
      if (currentValueTrimmed === initialTrimmed || trimmedQuery === initialTrimmed) {
        // Still matches initial - don't search
        // Abort any in-flight requests
        if (abortRef.current) {
          abortRef.current.abort()
          abortRef.current = null
        }
        setIsLoading(false)
        setIsOpen(false)
        setSuggestions([]) // Clear any existing suggestions
        return // EARLY RETURN - don't proceed with any fetch logic
      }
    }
    
    // Mark that initial mount is complete
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
    }

    // If we just selected a suggestion, suppress the next search triggered by programmatic value change
    // Also check if the query looks like a complete formatted address (has multiple commas) - this indicates a selection was made
    // This prevents searching when the value is accidentally set to the full formatted address
    const looksLikeFormattedAddress = trimmedQuery.includes(',') && trimmedQuery.split(',').length >= 3
    
    // Check if value prop was updated programmatically (from place selection) and doesn't match debouncedQuery
    // This prevents searching with stale debouncedQuery after place selection
    const valueTrimmed = value?.trim() || ''
    
    // If we just selected a place, always suppress searches until debouncedQuery catches up
    // This is the most reliable check - if selection flags are active, don't search
    // Also check timestamp - if selection happened recently (within 1 second), suppress
    const timeSinceSelection = Date.now() - lastSelectionTimestampRef.current
    const recentlySelected = lastSelectionTimestampRef.current > 0 && timeSinceSelection < 1000
    
    if (suppressNextFetchRef.current || justSelectedRef.current || hasJustSelected || isSuppressing || recentlySelected) {
      // Abort any pending searches
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      setIsLoading(false)
      setIsOpen(false)
      setShowGoogleAttribution(false)
      setShowFallbackMessage(false)
      setSuggestions([])
      return
    }
    
    // If value matches last selected address, it's a programmatic update - don't search
    // This prevents searches when user clicks back into field after selection
    const isSelectedAddress = lastSelectedAddressRef.current && valueTrimmed === lastSelectedAddressRef.current
    
    // CRITICAL: If current value prop doesn't match debouncedQuery, and we have a selected address,
    // this means debouncedQuery is stale (hasn't caught up with value prop update from selection)
    // In this case, NEVER search - wait for debouncedQuery to catch up
    // This is the key fix: if value prop was updated by selection but debouncedQuery is still old, don't search
    const debouncedQueryIsStale = valueTrimmed && 
      valueTrimmed !== trimmedQuery && 
      lastSelectedAddressRef.current &&
      valueTrimmed === lastSelectedAddressRef.current
    
    // If value changed but doesn't match debouncedQuery, it's likely a programmatic update
    // This happens when: value was set by place selection but debouncedQuery still has old typed value
    const valueChangedProgrammatically = debouncedQueryIsStale || (valueTrimmed && 
      valueTrimmed !== trimmedQuery && 
      isSelectedAddress)
    
    // ALWAYS suppress if debouncedQuery is stale (value prop updated but debouncedQuery hasn't caught up)
    // This is the most critical check - prevents searches with stale debouncedQuery after selection
    if (debouncedQueryIsStale) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AddressAutocomplete] Suppressing search - debouncedQuery is stale after selection', {
          value: valueTrimmed,
          debouncedQuery: trimmedQuery,
          lastSelectedAddress: lastSelectedAddressRef.current
        })
      }
      // Abort any pending searches
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      setIsLoading(false)
      setIsOpen(false)
      setShowGoogleAttribution(false)
      setShowFallbackMessage(false)
      setSuggestions([])
      return
    }
    
    if (looksLikeFormattedAddress || valueChangedProgrammatically) {
      // Abort any pending searches if value was updated programmatically
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      setIsLoading(false)
      setIsOpen(false)
      setShowGoogleAttribution(false)
      setShowFallbackMessage(false)
      setSuggestions([]) // Clear suggestions when value changed programmatically
      return
    }
    
    // Check query patterns
    const isNumericOnly = /^\d{1,6}$/.test(trimmedQuery)
    // More lenient regex: allow digits followed by space and at least one letter (can be abbreviated like "h", "hy", "hwy")
    const digitsStreetMatch = trimmedQuery.match(/^(?<num>\d{1,8})\s+(?<street>[A-Za-z].*)$/)
    const isDigitsStreet = digitsStreetMatch !== null
    const hasCoords = Boolean(userLat && userLng)
    
    // Minimum length: 1 for numeric-only, 2 for general text
    const minLength = isNumericOnly ? 1 : 2
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[AddressAutocomplete] Query processing: "${trimmedQuery}" (length: ${trimmedQuery.length}, minLength: ${minLength}, isNumericOnly: ${isNumericOnly}, isDigitsStreet: ${isDigitsStreet}, hasCoords: ${hasCoords}, hasGoogleToken: ${!!googleSessionToken}, digitsStreetMatch: ${!!digitsStreetMatch?.groups})`)
    }
    
    if (!trimmedQuery || trimmedQuery.length < minLength) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[AddressAutocomplete] Query too short: "${trimmedQuery}" (length: ${trimmedQuery.length} < ${minLength})`)
      }
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
    
    // Try Google first when we have coords and minimum length
    const minLen = isNumericOnly ? 1 : 2

    if (hasCoords && trimmedQuery.length >= minLen && googleSessionToken) {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      googleAutocomplete(trimmedQuery, userLat as number, userLng as number, googleSessionToken, controller.signal)
        .then(async (predictions) => {
          if (requestIdRef.current !== currentId) return
          if (predictions && predictions.length > 0) {
            setShowGoogleAttribution(true)
            // Render predictions as suggestions (without coords) using their primary/secondary text
            const limited = predictions.slice(0, 2)
            const suggestions: AddressSuggestion[] = limited.map((p, _idx) => ({
              id: `google:${p.placeId}`,
              label: p.primaryText + (p.secondaryText ? `, ${p.secondaryText}` : ''),
              lat: userLat as number,
              lng: userLng as number,
            }))
            setSuggestions(suggestions)
            setIsOpen(suggestions.length > 0)
            setSelectedIndex(-1)
            setShowFallbackMessage(false)
            setIsLoading(false)
          } else {
            // Google returned empty → check if digits+street and use Overpass, otherwise fallback to Nominatim
            setShowGoogleAttribution(false)
            
            // Check if this is a digits+street query and use Overpass
            const digitsStreetMatch = trimmedQuery.match(/^(?<num>\d{1,8})\s+(?<street>[A-Za-z].*)$/)
            if (digitsStreetMatch?.groups && hasCoords) {
              if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                console.log('[DEBUG] [AddressAutocomplete] Google empty, trying Overpass (digits+street)', { q: trimmedQuery, userLat, userLng })
              }
              return fetchOverpassAddresses(trimmedQuery, userLat as number, userLng as number, 2, controller.signal)
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
                    setShowFallbackMessage(unique.length > 0)
                    setIsLoading(false)
                    return
                  }
                  
                  // Overpass failed, fallback to Nominatim
                  console.warn(`[AddressAutocomplete] Overpass failed/empty after Google, falling back to Nominatim for "${trimmedQuery}"`)
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
                    .finally(() => setIsLoading(false))
                })
                .catch(() => {
                  // Overpass error, fallback to Nominatim
                  if (requestIdRef.current !== currentId) return
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
                    .finally(() => setIsLoading(false))
                })
            }
            
            // Not digits+street, use Nominatim
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
              .finally(() => setIsLoading(false))
          }
        })
        .catch(() => {
          // Google error → check if digits+street and use Overpass, otherwise fallback to Nominatim
          if (requestIdRef.current !== currentId) return
          setShowGoogleAttribution(false)
          
          // Check if this is a digits+street query and use Overpass
          const digitsStreetMatch = trimmedQuery.match(/^(?<num>\d{1,8})\s+(?<street>[A-Za-z].*)$/)
          if (digitsStreetMatch?.groups && hasCoords) {
            console.log('[AddressAutocomplete] Google error, trying Overpass (digits+street)', { q: trimmedQuery, userLat, userLng })
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
                  setShowFallbackMessage(unique.length > 0)
                  setIsLoading(false)
                  return
                }
                
                // Overpass failed, fallback to Nominatim
                console.warn(`[AddressAutocomplete] Overpass failed/empty after Google error, falling back to Nominatim for "${trimmedQuery}"`)
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
                  .finally(() => setIsLoading(false))
              })
              .catch(() => {
                // Overpass error, fallback to Nominatim
                if (requestIdRef.current !== currentId) return
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
                  .finally(() => setIsLoading(false))
              })
            return
          }
          
          // Not digits+street, use Nominatim
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
            .finally(() => setIsLoading(false))
        })
      return
    }

    // For digits+street queries with coords, try Overpass first
    if (isDigitsStreet && hasCoords && digitsStreetMatch?.groups) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[DEBUG] [AddressAutocomplete] Fetching Overpass addresses (digits+street)', { q: trimmedQuery, userLat, userLng, hasGroups: !!digitsStreetMatch?.groups })
      }
      
      // Use async helper to avoid nested promise chains
      void handleOverpassLookup(
        trimmedQuery,
        userLat,
        userLng,
        currentId,
        requestIdRef,
        controller.signal,
        setIsLoading,
        setSuggestions,
        setIsOpen,
        setSelectedIndex,
        setShowFallbackMessage,
        true // enableFallback = true for digits+street
      )
    } else if (isNumericOnly && hasCoords) {
      // For numeric-only queries with coords, try Overpass first
      if (process.env.NODE_ENV === 'development') {
        console.log('[AddressAutocomplete] Fetching Overpass addresses', { prefix: trimmedQuery, userLat, userLng })
      }
      
      // Use async helper to avoid nested promise chains
      void handleOverpassLookup(
        trimmedQuery,
        userLat,
        userLng,
        currentId,
        requestIdRef,
        controller.signal,
        setIsLoading,
        setSuggestions,
        setIsOpen,
        setSelectedIndex,
        setShowFallbackMessage,
        false // enableFallback = false for numeric-only
      )
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
    const run = async () => {
      let final = suggestion
      
      // ALWAYS fetch Place Details for Google suggestions (never short-circuit)
      if (suggestion.id?.startsWith('google:') && googleSessionToken) {
        const placeId = suggestion.id.split(':')[1]
        const details = await googlePlaceDetails(placeId, googleSessionToken).catch((error) => {
          console.error('[AddressAutocomplete] Error fetching Google Place Details:', error)
          return null
        })
        if (details) {
          final = details
        } else {
          // If Details fails, fall back to original suggestion but log warning
          console.warn('[AddressAutocomplete] Google Place Details returned null, using original suggestion')
        }
        // End session after selection
        setGoogleSessionToken(null)
      }

      // Extract address components from normalized suggestion
      const addressLine1 = final.address?.line1 || final.address?.road || ''
      const city = final.address?.city || ''
      const stateRaw = final.address?.state || ''
      const state = normalizeState(stateRaw) // Convert state name to abbreviation if needed
      const zip = final.address?.zip || final.address?.postcode || ''
      const _country = final.address?.country || 'US' // Extracted but not currently used in callback
      
      // Use line1 (street address) for the address field, not the full formatted label
      // Parse from label only if address components are missing, but never use full label
      let streetAddress = addressLine1
      if (!streetAddress && final.label) {
        // Try to extract street address from label (first part before first comma)
        const firstPart = final.label.split(',')[0]?.trim()
        if (firstPart && firstPart.length > 0) {
          streetAddress = firstPart
        }
      }
      // Safety check: if streetAddress looks like a full formatted address (contains multiple commas),
      // extract just the first part
      if (streetAddress && streetAddress.includes(',')) {
        streetAddress = streetAddress.split(',')[0]?.trim() || ''
      }
      // If still no street address, use empty string rather than full label
      if (!streetAddress) {
        streetAddress = ''
      }

      // Prevent an immediate re-query from the newly populated address value
      suppressNextFetchRef.current = true
      justSelectedRef.current = true
      setHasJustSelected(true)
      setIsSuppressing(true) // Update state for JSX render
      
      // Abort any pending searches immediately
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      
      // Close dropdown and clear suggestions
      setIsOpen(false)
      setSuggestions([])
      setShowFallbackMessage(false)
      setShowGoogleAttribution(false)
      setIsLoading(false)

      // Call onPlaceSelected to update all form fields atomically
      // Use street address (line1) for address field, not full formatted label
      if (onPlaceSelected) {
        const placeData = {
          address: streetAddress, // Use street address (number + street name)
          city: city || '',
          state: state || '',
          zip: zip || '',
          lat: final.lat,
          lng: final.lng
        }
        try {
          // Track the selected address to prevent re-searching when user clicks back into field
          lastSelectedAddressRef.current = streetAddress
          lastSelectionTimestampRef.current = Date.now() // Track when selection happened
          onPlaceSelected(placeData)
        } catch (error) {
          console.error('[AddressAutocomplete] Error calling onPlaceSelected:', error)
        }
      }
      
      // Don't call onChange after place selection - onPlaceSelected already updates all fields
      // The input value will update automatically via the value prop from the parent
      // Use setTimeout to keep focus and manage suppress flags
      setTimeout(() => {
        // Keep focus on input after selection
        inputRef.current?.focus()
        // Keep suppress flag active for longer to prevent debounced query and blur geocoding
        // Also keep it active long enough for debouncedQuery to catch up with the new value
        setTimeout(() => {
          suppressNextFetchRef.current = false
          justSelectedRef.current = false
          setHasJustSelected(false)
          setIsSuppressing(false) // Update state for JSX render
        }, 1000) // 1000ms = 250ms debounce + 750ms buffer to ensure debouncedQuery has fully updated and stabilized
      }, 0)
    }
    run()
  }, [onChange, onPlaceSelected, googleSessionToken])

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
    // Don't reset session token on blur if we just selected (allow Details call to complete)
    if (!justSelectedRef.current) {
      setGoogleSessionToken(null)
    }
    // Delay to allow click on suggestion to register
    setTimeout(async () => {
      // Only geocode if:
      // 1. Dropdown is closed
      // 2. We didn't just select (check both ref and state)
      // 3. Not already geocoding
      // 4. Value is long enough
      // 5. Suppress flag is not active (additional safety check)
      if (
        value && 
        value.length >= 5 && 
        onPlaceSelected && 
        !isGeocoding && 
        !isOpen && 
        !justSelectedRef.current && 
        !hasJustSelected &&
        !suppressNextFetchRef.current
      ) {
        setIsGeocoding(true)
        try {
          const result = await geocodeAddress(value)
          if (result) {
            // Parse formatted_address to extract street address (first part before comma)
            // Don't use the full formatted_address for the address field
            const streetAddress = result.formatted_address?.split(',')[0]?.trim() || result.formatted_address || ''
            
            onPlaceSelected({
              address: streetAddress, // Use parsed street address, not full formatted address
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
    if (!googleSessionToken) setGoogleSessionToken(newSessionToken())
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
          onChange={(e) => {
            const newValue = e.target.value
            const timeSinceSelection = Date.now() - lastSelectionTimestampRef.current
            const recentlySelected = lastSelectionTimestampRef.current > 0 && timeSinceSelection < 1000
            const valueTrimmed = value?.trim() || ''
            const newValueTrimmed = newValue.trim()
            
            // CRITICAL: If current value prop matches selected address, NEVER allow onChange with different value
            // This prevents the value from reverting when user clicks back into field
            // The value prop is the source of truth - if it matches selected address, don't allow changes
            if (lastSelectedAddressRef.current && valueTrimmed === lastSelectedAddressRef.current && newValueTrimmed !== valueTrimmed) {
              // Value prop matches selected address, but onChange is trying to change it
              // This is a revert attempt - prevent it
              if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                console.log('[AddressAutocomplete] Preventing onChange - value revert detected', {
                  newValue: newValueTrimmed,
                  currentValue: valueTrimmed,
                  lastSelectedAddress: lastSelectedAddressRef.current,
                  recentlySelected
                })
              }
              // Force input to show correct value (the selected address)
              if (inputRef.current && inputRef.current.value !== valueTrimmed) {
                inputRef.current.value = valueTrimmed
              }
              return
            }
            
            // If we recently selected and user is typing something new, allow it (clear selection tracking)
            if (recentlySelected && newValueTrimmed !== valueTrimmed && newValueTrimmed !== lastSelectedAddressRef.current) {
              // User is explicitly typing something different - allow it
              lastSelectedAddressRef.current = null
              lastSelectionTimestampRef.current = 0
            } else if (lastSelectedAddressRef.current && newValueTrimmed === lastSelectedAddressRef.current && (suppressNextFetchRef.current || recentlySelected)) {
              // This is likely a programmatic update or stale value, don't call onChange
              if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                console.log('[AddressAutocomplete] Preventing onChange - programmatic update detected', {
                  newValue: newValueTrimmed,
                  lastSelectedAddress: lastSelectedAddressRef.current,
                  currentValue: valueTrimmed,
                  suppressNextFetch: suppressNextFetchRef.current,
                  recentlySelected
                })
              }
              return
            }
            // Mark that user has interacted with the field
            hasUserInteractedRef.current = true
            // User is manually typing - clear last selected address and timestamp so searches work normally
            if (newValue !== lastSelectedAddressRef.current) {
              lastSelectedAddressRef.current = null
              lastSelectionTimestampRef.current = 0
            }
            // Only reset selection flags if user is manually typing (not programmatic update)
            if (!suppressNextFetchRef.current && !recentlySelected) {
              justSelectedRef.current = false
              setHasJustSelected(false)
            }
            onChange(newValue)
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={`${className} ${error ? 'border-red-500' : ''}`}
          required={required}
          minLength={5}
          disabled={isGeocoding}
          autoComplete="new-password"
          name="sale_address_line1"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="address-suggestions"
          aria-activedescendant={selectedIndex >= 0 ? `suggestion-${selectedIndex}` : undefined}
          aria-invalid={!!error}
          aria-describedby={error ? 'address-error' : undefined}
          role="combobox"
        />
        
        {error && (
          <p id="address-error" className="mt-1 text-sm text-red-600" role="alert">{error}</p>
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
        {!isLoading && !hasJustSelected && !isSuppressing && (() => {
          const trimmedValue = value?.trim() || ''
          // Don't show "No results found" if the value looks like a complete address (has commas, city/state/zip pattern)
          const looksLikeCompleteAddress = /,/.test(trimmedValue) && trimmedValue.length > 10
          if (looksLikeCompleteAddress) return false
          // Don't show "No results found" if the value looks like a selected street address
          // (starts with number, has street name, but no commas - typical of a selected address)
          const looksLikeSelectedAddress = /^\d+\s+[A-Za-z].*[A-Za-z]/.test(trimmedValue) && !/,/.test(trimmedValue) && trimmedValue.length > 5
          if (looksLikeSelectedAddress) return false
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
                onMouseDown={(e) => {
                  e.preventDefault() // Prevent input blur
                  handleSelect(suggestion)
                }}
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
        {isOpen && showGoogleAttribution && <PoweredBy provider="google" />}
      </div>
      
      {/* OSM Attribution - only show when OSM-based suggestions are visible (i.e., not Google) */}
      {isOpen && !showGoogleAttribution && (
        <div className="mt-2">
          <OSMAttribution showGeocoding={true} />
        </div>
      )}
    </div>
  )
}
