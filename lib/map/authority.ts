/**
 * Map Authority Management
 * 
 * Implements explicit session-level map authority model:
 * - system: GPS-first on cold start, can be overridden by user
 * - user: User has taken control, no automatic recentering
 * 
 * Authority is stored in sessionStorage and persists across navigation
 * but resets on hard refresh, app restart, or new tab.
 */

export type MapAuthority = 'system' | 'user'

const AUTHORITY_KEY = 'map:authority'

/**
 * Get current map authority
 * Defaults to 'system' if not set
 */
export function getMapAuthority(): MapAuthority {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return 'system'
  }

  try {
    const stored = sessionStorage.getItem(AUTHORITY_KEY)
    if (stored === 'system' || stored === 'user') {
      return stored as MapAuthority
    }
  } catch (error) {
    // sessionStorage may be unavailable (private browsing, etc.)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[MAP:AUTHORITY] Failed to read authority:', error)
    }
  }

  return 'system'
}

/**
 * Set map authority
 * Once set to 'user', it remains 'user' for the session
 */
export function setMapAuthority(authority: MapAuthority): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return
  }

  try {
    // If authority is already 'user', don't allow downgrade to 'system'
    const current = getMapAuthority()
    if (current === 'user' && authority === 'system') {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[MAP:AUTHORITY] Cannot downgrade from user to system authority')
      }
      return
    }

    sessionStorage.setItem(AUTHORITY_KEY, authority)
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[MAP:AUTHORITY] Authority set to:', authority)
    }
  } catch (error) {
    // sessionStorage may be unavailable
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[MAP:AUTHORITY] Failed to set authority:', error)
    }
  }
}

/**
 * Check if this is a cold start (no authority set)
 * Cold start = no authority in sessionStorage
 */
export function isColdStart(): boolean {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return true
  }

  try {
    const stored = sessionStorage.getItem(AUTHORITY_KEY)
    return stored === null
  } catch {
    return true
  }
}

/**
 * Check if authority is user (user has taken control)
 */
export function isUserAuthority(): boolean {
  return getMapAuthority() === 'user'
}

/**
 * Check if authority is system (GPS-first allowed)
 */
export function isSystemAuthority(): boolean {
  return getMapAuthority() === 'system'
}

/**
 * Flip authority to user (called on any user action)
 * This is a one-way operation for the session
 */
export function flipToUserAuthority(): void {
  setMapAuthority('user')
}
