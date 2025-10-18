/**
 * URL State Management for Map + Filters
 * Handles serialization/deserialization of viewport and filter state
 */

import { z } from 'zod'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

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
 * Serialize state to stable JSON string
 * Ensures deterministic output with sorted keys for consistent compression
 */
export function serializeState(state: AppState): string {
  // Create a normalized state with sorted keys for deterministic output
  const normalizedState = {
    view: {
      lat: state.view.lat,
      lng: state.view.lng,
      zoom: state.view.zoom
    },
    filters: {
      dateRange: state.filters.dateRange || 'any',
      categories: state.filters.categories ? [...state.filters.categories].sort() : [],
      radius: state.filters.radius || 25
    }
  }
  
  return JSON.stringify(normalizedState)
}

/**
 * Deserialize URL query string or JSON to validated state
 * Handles both URL query strings and JSON format for backward compatibility
 */
export function deserializeState(input: string): AppState {
  // Try to parse as JSON first (new format)
  try {
    const parsed = JSON.parse(input)
    return StateSchema.parse(parsed)
  } catch {
    // Fall back to URL query string format (legacy)
    const params = new URLSearchParams(input)
    
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
}

/**
 * Compress state using lz-string for efficient compression
 * Returns prefixed format: "c:<compressed>" if shorter, "j:<raw-json>" otherwise
 */
export function compressState(state: AppState): string {
  // Get the stable JSON representation
  const json = serializeState(state)
  
  // Try compression
  const compressed = compressToEncodedURIComponent(json) || ''
  
  // If compressed is shorter, use compressed format
  if (compressed.length < json.length) {
    return `c:${compressed}`
  }
  
  // Otherwise, fall back to raw JSON with prefix
  return `j:${json}`
}

/**
 * Decompress state from compressed format
 * Handles "c:<compressed>", "j:<raw-json>", and bare JSON (back-compat)
 */
export function decompressState(compressed: string): AppState {
  if (!compressed) throw new Error('Empty state blob')

  // Compressed format: "c:<payload>"
  if (compressed.startsWith('c:')) {
    const payload = compressed.slice(2)
    const json = decompressFromEncodedURIComponent(payload)
    if (!json) throw new Error('Decompression failed')
    const parsed = JSON.parse(json)
    return StateSchema.parse(parsed)
  }

  // Raw JSON format: "j:<json>"
  if (compressed.startsWith('j:')) {
    const json = compressed.slice(2)
    const parsed = JSON.parse(json)
    return StateSchema.parse(parsed)
  }

  // Back-compat: bare JSON (legacy format)
  try {
    const parsed = JSON.parse(compressed)
    return StateSchema.parse(parsed)
  } catch {
    throw new Error('Invalid state format')
  }
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
