/**
 * URL State Management for Map + Filters
 * Handles serialization/deserialization of viewport and filter state
 */

import { z } from 'zod'

// Schema for viewport state
const ViewportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  zoom: z.number().min(0).max(22)
})

// Schema for filter state
const FilterSchema = z.object({
  dateRange: z.string().optional(),
  categories: z.array(z.string()).optional(),
  radius: z.number().optional()
})

// Complete state schema
const StateSchema = z.object({
  view: ViewportSchema,
  filters: FilterSchema
})

export type ViewportState = z.infer<typeof ViewportSchema>
export type FilterState = z.infer<typeof FilterSchema>
export type AppState = z.infer<typeof StateSchema>

/**
 * Serialize state to URL query string
 * Ensures stable key order and sorted arrays for consistent URLs
 */
export function serializeState(state: AppState): string {
  const params = new URLSearchParams()
  
  // Viewport (always present)
  params.set('lat', state.view.lat.toString())
  params.set('lng', state.view.lng.toString())
  params.set('zoom', state.view.zoom.toString())
  
  // Filters (only if not default values)
  if (state.filters.dateRange && state.filters.dateRange !== 'any') {
    params.set('date', state.filters.dateRange)
  }
  
  if (state.filters.categories && state.filters.categories.length > 0) {
    // Sort categories for consistent URLs
    const sortedCategories = [...state.filters.categories].sort()
    params.set('cats', sortedCategories.join(','))
  }
  
  if (state.filters.radius && state.filters.radius !== 25) {
    params.set('radius', state.filters.radius.toString())
  }
  
  return params.toString()
}

/**
 * Deserialize URL query string to validated state
 * Ignores unknown keys and provides defaults for missing values
 */
export function deserializeState(search: string): AppState {
  const params = new URLSearchParams(search)
  
  // Default viewport (Louisville, KY)
  const lat = parseFloat(params.get('lat') || '38.2527')
  const lng = parseFloat(params.get('lng') || '-85.7585')
  const zoom = parseFloat(params.get('zoom') || '10')
  
  // Default filters
  const dateRange = params.get('date') || 'any'
  const categories = params.get('cats')?.split(',').filter(Boolean) || []
  const radius = parseFloat(params.get('radius') || '25')
  
  const state: AppState = {
    view: { lat, lng, zoom },
    filters: { dateRange, categories, radius }
  }
  
  // Validate and return
  return StateSchema.parse(state)
}

/**
 * Compress state to base64url for shortlink generation
 * Used for /s/<id> fallback URLs
 */
export function compressState(state: AppState): string {
  const serialized = serializeState(state)
  return btoa(serialized)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Decompress state from base64url
 * Used to restore state from shortlink
 */
export function decompressState(compressed: string): AppState {
  // Add padding if needed
  const padded = compressed + '='.repeat((4 - compressed.length % 4) % 4)
  const serialized = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return deserializeState(serialized)
}

/**
 * Check if current state differs from URL
 * Used to determine when to update URL
 */
export function hasStateChanged(current: AppState, urlState: AppState): boolean {
  return JSON.stringify(current) !== JSON.stringify(urlState)
}

/**
 * Get default state
 */
export function getDefaultState(): AppState {
  return {
    view: { lat: 38.2527, lng: -85.7585, zoom: 10 },
    filters: { dateRange: 'any', categories: [], radius: 25 }
  }
}
