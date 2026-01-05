/**
 * Viewport and filter persistence for map state
 * Handles localStorage persistence with versioning and graceful fallback
 */

export interface ViewportState {
  lat: number
  lng: number
  zoom: number
}

export interface FilterState {
  dateRange: string
  categories: string[]
  radius: number
}

export interface PersistedState {
  viewport: ViewportState
  filters: FilterState
  version: string
  timestamp: number
}

const STORAGE_KEY = 'yard-sale-map-state'
const SCHEMA_VERSION = '1.0.0'
// Staleness policy: persisted state is valid for 30 days
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days in ms

/**
 * Save viewport and filter state to localStorage
 */
export function saveViewportState(viewport: ViewportState, filters: FilterState): void {
  try {
    const state: PersistedState = {
      viewport,
      filters,
      version: SCHEMA_VERSION,
      timestamp: Date.now()
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    // Gracefully handle localStorage errors (private browsing, quota exceeded, etc.)
    console.warn('[MAP:PERSISTENCE] Failed to save state:', error)
  }
}

/**
 * Load persisted viewport and filter state from localStorage
 * Returns null if no valid state found or version mismatch
 */
export function loadViewportState(): { viewport: ViewportState; filters: FilterState } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    
    const state: PersistedState = JSON.parse(stored)
    
    // Check version compatibility
    if (state.version !== SCHEMA_VERSION) {
      console.log('[MAP:PERSISTENCE] Version mismatch, clearing state')
      clearViewportState()
      return null
    }
    
    // Check if state is too old (30 days)
    if (Date.now() - state.timestamp > MAX_AGE_MS) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[MAP:PERSISTENCE] State too old, clearing')
      }
      clearViewportState()
      return null
    }
    
    return {
      viewport: state.viewport,
      filters: state.filters
    }
  } catch (error) {
    console.warn('[MAP:PERSISTENCE] Failed to load state:', error)
    clearViewportState()
    return null
  }
}

/**
 * Clear persisted state from localStorage
 */
export function clearViewportState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.warn('[MAP:PERSISTENCE] Failed to clear state:', error)
  }
}

/**
 * Check if we have valid persisted state
 */
export function hasPersistedState(): boolean {
  return loadViewportState() !== null
}
