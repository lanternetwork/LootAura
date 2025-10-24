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
  opts: MapReadinessOptions = { retries: 10, delayMs: 200 }
): Promise<any> {
  const { retries = 10, delayMs = 200 } = opts
  
  for (let i = 0; i < retries; i++) {
    const map = ref.current?.getMap?.()
    if (map && map.isStyleLoaded?.()) {
      return map
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
    return ref.current?.getMap?.() || null
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