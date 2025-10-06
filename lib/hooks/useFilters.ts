'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface FilterState {
  lat?: number
  lng?: number
  distance: number
  dateRange: 'today' | 'weekend' | 'any'
  categories: string[]
  city?: string
}

export interface UseFiltersReturn {
  filters: FilterState
  updateFilters: (newFilters: Partial<FilterState>) => void
  clearFilters: () => void
  hasActiveFilters: boolean
  getQueryString: () => string
}

const DEFAULT_FILTERS: FilterState = {
  distance: 25,
  dateRange: 'any',
  categories: []
}

export function useFilters(initialLocation?: { lat: number; lng: number }): UseFiltersReturn {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<FilterState>(() => {
    // Initialize with initialLocation if provided
    if (initialLocation) {
      return { ...DEFAULT_FILTERS, lat: initialLocation.lat, lng: initialLocation.lng }
    }
    return DEFAULT_FILTERS
  })

  // Initialize filters from URL params
  useEffect(() => {
    const lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : undefined
    const lng = searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : undefined
    const distance = searchParams.get('dist') ? parseInt(searchParams.get('dist')!) : 25
    const dateParam = searchParams.get('date') as 'today' | 'weekend' | 'any' | 'range' | null
    const dateRange = !dateParam || dateParam === 'range' ? 'any' : dateParam
    const categories = searchParams.get('cat') ? searchParams.get('cat')!.split(',') : []
    const city = searchParams.get('city') || undefined

    // Only update if URL has location params, otherwise keep initial location
    const hasLocationParams = searchParams.get('lat') || searchParams.get('lng')
    
    setFilters(prev => ({
      lat: hasLocationParams ? lat : prev.lat,
      lng: hasLocationParams ? lng : prev.lng,
      distance: Math.max(1, Math.min(100, distance)),
      dateRange,
      categories,
      city
    }))
  // Only run on mount to seed from URL; further changes are driven by updateFilters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateFilters = useCallback((newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters }
    setFilters(updatedFilters)
    
    // Update URL with new filters
    const params = new URLSearchParams(searchParams.toString())
    
    // Update location
    if (updatedFilters.lat && updatedFilters.lng) {
      params.set('lat', updatedFilters.lat.toString())
      params.set('lng', updatedFilters.lng.toString())
    } else {
      params.delete('lat')
      params.delete('lng')
    }
    
    // Update distance
    if (updatedFilters.distance !== 25) {
      params.set('dist', updatedFilters.distance.toString())
    } else {
      params.delete('dist')
    }
    
    // Update date range
    if (updatedFilters.dateRange !== 'any') {
      params.set('date', updatedFilters.dateRange)
    } else {
      params.delete('date')
    }
    
    // Update categories
    if (updatedFilters.categories.length > 0) {
      params.set('cat', updatedFilters.categories.join(','))
    } else {
      params.delete('cat')
    }
    
    // Update city
    if (updatedFilters.city) {
      params.set('city', updatedFilters.city)
    } else {
      params.delete('city')
    }
    
    // Update URL
    const newUrl = `${window.location.pathname}?${params.toString()}`
    router.push(newUrl)
  }, [filters, searchParams, router])

  const clearFilters = useCallback(() => {
    updateFilters(DEFAULT_FILTERS)
  }, [updateFilters])

  const hasActiveFilters = useCallback(() => {
    return (
      filters.distance !== 25 ||
      filters.dateRange !== 'any' ||
      filters.categories.length > 0 ||
      !!filters.city
    )
  }, [filters])

  const getQueryString = useCallback(() => {
    const params = new URLSearchParams()
    
    if (filters.lat && filters.lng) {
      params.set('lat', filters.lat.toString())
      params.set('lng', filters.lng.toString())
    }
    
    if (filters.distance !== 25) {
      params.set('dist', filters.distance.toString())
    }
    
    if (filters.dateRange !== 'any') {
      params.set('date', filters.dateRange)
    }
    
    if (filters.categories.length > 0) {
      params.set('cat', filters.categories.join(','))
    }
    
    if (filters.city) {
      params.set('city', filters.city)
    }
    
    return params.toString()
  }, [filters])

  return {
    filters,
    updateFilters,
    clearFilters,
    hasActiveFilters: hasActiveFilters(),
    getQueryString
  }
}
