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
 * Compress state using a more efficient method than base64
 * Uses a custom encoding that's shorter than base64 for typical state data
 */
export function compressState(state: AppState): string {
  // Create a compact JSON representation with sorted arrays for better compression
  const compactState = {
    v: state.view,
    f: {
      d: state.filters.dateRange,
      c: state.filters.categories?.sort() || [],
      r: state.filters.radius
    }
  }
  
  const json = JSON.stringify(compactState)
  
  // Use a simple but effective compression: replace common patterns
  let compressed = json
    .replace(/"lat":/g, 'l')
    .replace(/"lng":/g, 'n')
    .replace(/"zoom":/g, 'z')
    .replace(/"dateRange":/g, 'd')
    .replace(/"categories":/g, 'c')
    .replace(/"radius":/g, 'r')
    .replace(/"view":/g, 'v')
    .replace(/"filters":/g, 'f')
    .replace(/"today"/g, 't')
    .replace(/"this-weekend"/g, 'w')
    .replace(/"next-weekend"/g, 'nw')
    .replace(/"any"/g, 'a')
    .replace(/"electronics"/g, 'e')
    .replace(/"furniture"/g, 'f')
    .replace(/"tools"/g, 't')
    .replace(/"books"/g, 'b')
    .replace(/"clothing"/g, 'c')
    .replace(/"sports"/g, 's')
    .replace(/"toys"/g, 'y')
    .replace(/"home"/g, 'h')
    .replace(/"garden"/g, 'g')
    .replace(/"automotive"/g, 'a')
  
  // Encode to base64url but with a prefix to indicate this is compressed
  return 'c:' + btoa(compressed)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Decompress state from compressed format
 * Used to restore state from shortlink
 */
export function decompressState(compressed: string): AppState {
  if (!compressed.startsWith('c:')) {
    // Fallback to old base64 format for backward compatibility
    const padded = compressed + '='.repeat((4 - compressed.length % 4) % 4)
    const serialized = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
    return deserializeState(serialized)
  }
  
  // Remove prefix and decode
  const encoded = compressed.slice(2)
  const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4)
  const decompressed = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  
  // Reverse the compression
  let json = decompressed
    .replace(/l/g, '"lat":')
    .replace(/n/g, '"lng":')
    .replace(/z/g, '"zoom":')
    .replace(/d/g, '"dateRange":')
    .replace(/c/g, '"categories":')
    .replace(/r/g, '"radius":')
    .replace(/v/g, '"view":')
    .replace(/f/g, '"filters":')
    .replace(/t/g, '"today"')
    .replace(/w/g, '"this-weekend"')
    .replace(/nw/g, '"next-weekend"')
    .replace(/a/g, '"any"')
    .replace(/e/g, '"electronics"')
    .replace(/f/g, '"furniture"')
    .replace(/t/g, '"tools"')
    .replace(/b/g, '"books"')
    .replace(/c/g, '"clothing"')
    .replace(/s/g, '"sports"')
    .replace(/y/g, '"toys"')
    .replace(/h/g, '"home"')
    .replace(/g/g, '"garden"')
    .replace(/a/g, '"automotive"')
  
  const parsed = JSON.parse(json)
  
  // Convert back to full state format
  const state: AppState = {
    view: parsed.v,
    filters: {
      dateRange: parsed.f.d,
      categories: parsed.f.c,
      radius: parsed.f.r
    }
  }
  
  return StateSchema.parse(state)
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
