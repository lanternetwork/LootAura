'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { normalizeCategoryParams, normalizeCategories } from '@/lib/shared/categoryNormalizer'

export interface FilterState {
  lat?: number
  lng?: number
  distance: number
  dateRange: 'today' | 'weekend' | 'next_weekend' | 'any'
  categories: string[]
  city?: string
}

export interface UseFiltersReturn {
  filters: FilterState
  updateFilters: (newFilters: Partial<FilterState>, skipUrlUpdate?: boolean) => void
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
    console.log('[FILTERS] init from URL params:', Object.fromEntries(searchParams.entries()))
    const lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : undefined
    const lng = searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : undefined
    const distance = searchParams.get('dist') ? parseInt(searchParams.get('dist')!) : 25
    const dateParam = searchParams.get('date') as 'today' | 'weekend' | 'next_weekend' | 'any' | 'range' | null
    const dateRange = !dateParam || dateParam === 'range' ? 'any' : dateParam
    
    // Use canonical parameter normalization
    const { categories } = normalizeCategoryParams(searchParams)
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

  const updateFilters = useCallback((newFilters: Partial<FilterState>, skipUrlUpdate = false) => {
    const updatedFilters = { ...filters, ...newFilters }
    console.log('[FILTERS] updateFilters called with:', newFilters, '=> next:', updatedFilters)
    setFilters(updatedFilters)
    
    // Skip URL updates for auto-refetch scenarios to prevent scroll-to-top
    if (skipUrlUpdate) {
      console.log('[FILTERS] Skipping URL update for auto-refetch')
      return
    }
    
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
    
    // Update categories using canonical parameter (normalize and drop empties)
    const normalizedCats = normalizeCategories(updatedFilters.categories)
    if (normalizedCats.length > 0) {
      params.set('categories', normalizedCats.join(','))
    } else {
      params.delete('categories')
    }
    
    // Remove legacy 'cat' parameter if it exists
    params.delete('cat')
    
    // Debug assertion: ensure we never emit 'cat' parameter
    if (process.env.NEXT_PUBLIC_DEBUG === 'true' && params.get('cat')) {
      console.error('[FILTER DEBUG] ERROR: URL writer emitted legacy cat parameter! This should never happen.')
    }
    
    // Update city
    if (updatedFilters.city) {
      params.set('city', updatedFilters.city)
    } else {
      params.delete('city')
    }
    
    // Update URL without navigation or scroll using History API
    const newUrl = `${window.location.pathname}?${params.toString()}`
    console.log('[FILTERS] history.replaceState (no scroll):', newUrl)
    try {
      window.history.replaceState(null, '', newUrl)
    } catch {
      // Fallback to router.replace as a safety net
      router.replace(newUrl, { scroll: false })
    }
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
