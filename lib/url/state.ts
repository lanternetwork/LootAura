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
 * Uses custom encoding that's shorter than base64 for typical state data
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
  
  // Use compact JSON (no whitespace) and custom compression
  const json = JSON.stringify(compactState)
  
  // Custom compression: replace common patterns to make it shorter
  const compressed = json
    .replace(/"lat":/g, 'l')
    .replace(/"lng":/g, 'n') 
    .replace(/"zoom":/g, 'z')
    .replace(/"dateRange":/g, 'd')
    .replace(/"categories":/g, 'c')
    .replace(/"radius":/g, 'r')
    .replace(/"view":/g, 'v')
    .replace(/"filters":/g, 'f')
    .replace(/"today"/g, 'T')
    .replace(/"this-weekend"/g, 'W')
    .replace(/"next-weekend"/g, 'N')
    .replace(/"any"/g, 'a')
    .replace(/"electronics"/g, 'E')
    .replace(/"furniture"/g, 'F')
    .replace(/"tools"/g, 'O')
    .replace(/"books"/g, 'B')
    .replace(/"clothing"/g, 'C')
    .replace(/"sports"/g, 'S')
    .replace(/"toys"/g, 'Y')
    .replace(/"home"/g, 'H')
    .replace(/"garden"/g, 'G')
    .replace(/"automotive"/g, 'A')
  
  // Use URI-safe encoding without Base64 bloat
  return 'c:' + encodeURIComponent(compressed)
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
  const decompressed = decodeURIComponent(encoded)
  
  // Reverse the compression
  const json = decompressed
    .replace(/l/g, '"lat":')
    .replace(/n/g, '"lng":')
    .replace(/z/g, '"zoom":')
    .replace(/d/g, '"dateRange":')
    .replace(/c/g, '"categories":')
    .replace(/r/g, '"radius":')
    .replace(/v/g, '"view":')
    .replace(/f/g, '"filters":')
    .replace(/T/g, '"today"')
    .replace(/W/g, '"this-weekend"')
    .replace(/N/g, '"next-weekend"')
    .replace(/a/g, '"any"')
    .replace(/E/g, '"electronics"')
    .replace(/F/g, '"furniture"')
    .replace(/O/g, '"tools"')
    .replace(/B/g, '"books"')
    .replace(/C/g, '"clothing"')
    .replace(/S/g, '"sports"')
    .replace(/Y/g, '"toys"')
    .replace(/H/g, '"home"')
    .replace(/G/g, '"garden"')
    .replace(/A/g, '"automotive"')
  
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
