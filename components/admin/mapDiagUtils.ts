// MapRef is a namespace in react-map-gl v7, not a type

export interface MapReadinessOptions {
  retries?: number
  delayMs?: number
}

/**
 * Wait for map to be fully initialized and ready for operations
 * @param ref - React ref to the MapRef
 * @param opts - Options for retry behavior
 * @returns Promise that resolves to the map instance when ready
 */
export async function waitForMapReady(
  ref: React.RefObject<any>, 
  opts: MapReadinessOptions = { retries: 20, delayMs: 50 }
): Promise<any> {
  const { retries = 20, delayMs = 50 } = opts
  
  for (let i = 0; i < retries; i++) {
    // Check if the ref has the getMap method (new interface)
    if (ref.current?.getMap) {
      const map = ref.current.getMap()
      if (map) {
        const styleLoaded = map.isStyleLoaded?.()
        if (styleLoaded) {
          return map
        }
      }
    }
    
    // Only log every 5th attempt to reduce console noise
    if (i % 5 === 0) {
      console.log(`[MAP_DIAG] Attempt ${i + 1}/${retries}: checking map readiness`)
    }
    
    await new Promise(r => setTimeout(r, delayMs))
  }
  
  throw new Error('Map initialization timeout: instance or style not ready')
}

/**
 * Get map instance safely with error handling
 * @param ref - React ref to the MapRef
 * @returns Map instance or null if not available
 */
export function getMapInstance(ref: React.RefObject<any>): any | null {
  try {
    if (ref.current?.getMap) {
      return ref.current.getMap()
    }
    return null
  } catch (error) {
    console.warn('[MAP_DIAG] Failed to get map instance:', error)
    return null
  }
}

/**
 * Check if map is ready for operations
 * @param ref - React ref to the MapRef
 * @returns Promise that resolves to true if ready, false otherwise
 */
export async function isMapReady(ref: React.RefObject<any>): Promise<boolean> {
  try {
    const map = getMapInstance(ref)
    return !!(map && map.isStyleLoaded?.())
  } catch {
    return false
  }
}