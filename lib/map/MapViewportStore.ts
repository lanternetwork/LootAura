/**
 * MapViewportStore - Session-level viewport persistence
 * 
 * Owns the map viewport state after initialization.
 * Persists across navigation within the same browser session.
 * 
 * Rules:
 * - Initialized once per session
 * - Updated on user pan/zoom, pin click, fitBounds, explicit recenter
 * - NOT updated by IP geolocation, cookies, profile ZIP, or server props after mount
 */

export interface Viewport {
  center: { lat: number; lng: number }
  bounds: { west: number; south: number; east: number; north: number }
  zoom: number
}

const STORAGE_KEY = 'loot-aura:map-viewport'
const SESSION_ONLY = true // Use sessionStorage for persistence across navigation

class MapViewportStore {
  private viewport: Viewport | null = null
  private initialized = false

  /**
   * Get the current viewport, or null if not set
   */
  getViewport(): Viewport | null {
    if (this.viewport) {
      return this.viewport
    }

    // Try to load from sessionStorage if available
    if (typeof window !== 'undefined' && SESSION_ONLY) {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          // Validate structure
          if (
            parsed?.center?.lat &&
            parsed?.center?.lng &&
            parsed?.bounds &&
            typeof parsed?.zoom === 'number'
          ) {
            this.viewport = parsed
            return this.viewport
          }
        }
      } catch (error) {
        // Invalid stored data, clear it
        this.clearViewport()
      }
    }

    return null
  }

  /**
   * Set the viewport and persist it
   */
  setViewport(viewport: Viewport): void {
    // Validate viewport structure
    if (
      !viewport?.center?.lat ||
      !viewport?.center?.lng ||
      !viewport?.bounds ||
      typeof viewport?.zoom !== 'number'
    ) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[MapViewportStore] Invalid viewport structure:', viewport)
      }
      return
    }

    this.viewport = viewport
    this.initialized = true

    // Persist to sessionStorage
    if (typeof window !== 'undefined' && SESSION_ONLY) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(viewport))
      } catch (error) {
        // sessionStorage may be unavailable (private browsing, quota exceeded)
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[MapViewportStore] Failed to persist viewport:', error)
        }
      }
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[MapViewportStore] Viewport updated:', viewport)
    }
  }

  /**
   * Check if a viewport exists
   */
  hasViewport(): boolean {
    if (this.viewport) {
      return true
    }

    // Check sessionStorage
    if (typeof window !== 'undefined' && SESSION_ONLY) {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY)
        return stored !== null
      } catch {
        return false
      }
    }

    return false
  }

  /**
   * Clear the viewport (e.g., on explicit reset)
   */
  clearViewport(): void {
    this.viewport = null
    this.initialized = false

    if (typeof window !== 'undefined' && SESSION_ONLY) {
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch (error) {
        // Ignore errors
      }
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[MapViewportStore] Viewport cleared')
    }
  }

  /**
   * Check if store has been initialized (even if viewport is null)
   */
  isInitialized(): boolean {
    return this.initialized || this.hasViewport()
  }
}

// Singleton instance
const store = new MapViewportStore()

export default store

