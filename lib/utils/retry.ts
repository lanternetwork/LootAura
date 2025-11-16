/**
 * Retry utility for transient failures
 * Provides exponential backoff and configurable retry attempts
 */

export interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  retryable?: (error: unknown) => boolean
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryable'>> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
}

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries are exhausted
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = DEFAULT_OPTIONS.maxAttempts,
    initialDelayMs = DEFAULT_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_OPTIONS.maxDelayMs,
    backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
    retryable,
  } = options

  let lastError: unknown
  let delay = initialDelayMs

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check if error is retryable (if predicate provided)
      if (retryable && !retryable(error)) {
        throw error
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, maxDelayMs)))
      delay *= backoffMultiplier
    }
  }

  throw lastError
}

/**
 * Check if an error is likely transient (network, timeout, rate limit)
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  const transientPatterns = [
    'network',
    'timeout',
    'econnrefused',
    'econnreset',
    'etimedout',
    'rate limit',
    'too many requests',
    'service unavailable',
    'bad gateway',
    'gateway timeout',
    'temporary',
  ]

  return transientPatterns.some((pattern) => message.includes(pattern))
}

