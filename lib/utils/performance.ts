/**
 * Performance monitoring utilities
 * Provides lightweight timing and slow-query detection
 */

import { logger } from '@/lib/log'
import { isDebugMode } from '@/lib/env'

export interface PerformanceOptions {
  /**
   * Minimum duration in milliseconds to log (default: 200)
   * Only queries slower than this threshold will be logged
   */
  thresholdMs?: number
  
  /**
   * Whether to log even if below threshold (for debugging)
   * Default: false
   */
  alwaysLog?: boolean
  
  /**
   * Additional context to include in logs
   */
  context?: Record<string, any>
}

/**
 * Time an async operation and log if it exceeds the threshold
 * @param label - Descriptive label for the operation (e.g., 'sales:getMapSales')
 * @param fn - The async function to time
 * @param options - Performance monitoring options
 * @returns The result of the function
 */
export async function timeOperation<T>(
  label: string,
  fn: () => Promise<T>,
  options: PerformanceOptions = {}
): Promise<T> {
  const {
    thresholdMs = 200,
    alwaysLog = false,
    context = {}
  } = options

  const startTime = performance.now()
  
  try {
    const result = await fn()
    const duration = performance.now() - startTime
    
    // Log if above threshold or if alwaysLog is true
    if (duration > thresholdMs || alwaysLog || isDebugMode()) {
      logger.info(`Slow operation detected: ${label}`, {
        component: 'performance',
        operation: label,
        durationMs: Math.round(duration),
        thresholdMs,
        ...context
      })
    }
    
    return result
  } catch (error) {
    const duration = performance.now() - startTime
    
    // Always log errors, even if fast
    logger.error(`Operation failed: ${label}`, error instanceof Error ? error : new Error(String(error)), {
      component: 'performance',
      operation: label,
      durationMs: Math.round(duration),
      ...context
    })
    
    throw error
  }
}

/**
 * Time a synchronous operation (for non-async code)
 * @param label - Descriptive label for the operation
 * @param fn - The function to time
 * @param options - Performance monitoring options
 * @returns The result of the function
 */
export function timeSyncOperation<T>(
  label: string,
  fn: () => T,
  options: PerformanceOptions = {}
): T {
  const {
    thresholdMs = 200,
    alwaysLog = false,
    context = {}
  } = options

  const startTime = performance.now()
  
  try {
    const result = fn()
    const duration = performance.now() - startTime
    
    // Log if above threshold or if alwaysLog is true
    if (duration > thresholdMs || alwaysLog || isDebugMode()) {
      logger.info(`Slow sync operation detected: ${label}`, {
        component: 'performance',
        operation: label,
        durationMs: Math.round(duration),
        thresholdMs,
        ...context
      })
    }
    
    return result
  } catch (error) {
    const duration = performance.now() - startTime
    
    // Always log errors
    logger.error(`Sync operation failed: ${label}`, error instanceof Error ? error : new Error(String(error)), {
      component: 'performance',
      operation: label,
      durationMs: Math.round(duration),
      ...context
    })
    
    throw error
  }
}


