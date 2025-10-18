/**
 * Map telemetry for debug logging
 * Only logs when NEXT_PUBLIC_DEBUG=true
 */

import { isDebugEnabled } from '@/lib/flags'

/**
 * Log prefetch events
 */
export function logPrefetchStart(tileId: string): void {
  if (isDebugEnabled()) {
    console.debug('[MAP_PREFETCH] start', { tileId })
  }
}

export function logPrefetchDone(tileId: string, ms: number, count: number): void {
  if (isDebugEnabled()) {
    console.debug('[MAP_PREFETCH] done', { tileId, ms, count })
  }
}

export function logPrefetchSkip(tileId: string, reason: string): void {
  if (isDebugEnabled()) {
    console.debug('[MAP_PREFETCH] skip', { tileId, reason })
  }
}

/**
 * Log cache events
 */
export function logCacheHit(keys: string[]): void {
  if (isDebugEnabled()) {
    console.debug('[CACHE] hit', { keys: keys.length })
  }
}

export function logCacheMiss(keys: string[]): void {
  if (isDebugEnabled()) {
    console.debug('[CACHE] miss', { keys: keys.length })
  }
}

export function logCacheWrite(keys: string[]): void {
  if (isDebugEnabled()) {
    console.debug('[CACHE] write', { keys: keys.length })
  }
}

export function logCachePrune(count: number): void {
  if (isDebugEnabled()) {
    console.debug('[CACHE] prune', { count })
  }
}

/**
 * Log offline events
 */
export function logOfflineFallback(tileId: string): void {
  if (isDebugEnabled()) {
    console.debug('[OFFLINE] fallback used', { tileId })
  }
}

/**
 * Log viewport persistence events
 */
export function logViewportSave(viewport: { lat: number; lng: number; zoom: number }): void {
  if (isDebugEnabled()) {
    console.debug('[MAP:PERSISTENCE] viewport saved', { viewport })
  }
}

export function logViewportLoad(viewport: { lat: number; lng: number; zoom: number }): void {
  if (isDebugEnabled()) {
    console.debug('[MAP:PERSISTENCE] viewport loaded', { viewport })
  }
}
