/**
 * Debug utilities for client-side code
 * 
 * Use this to gate debug console logs behind NEXT_PUBLIC_DEBUG flag.
 * This prevents debug logs from appearing in production builds.
 */

export const isDebugEnabled =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_DEBUG === 'true'
