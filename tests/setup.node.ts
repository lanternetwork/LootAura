import { beforeEach, afterEach, vi } from 'vitest'

const rejectionHandler = (reason: unknown) => {
  // Ignore ZodErrors from env validation during tests
  // These are expected when testing error conditions in env.test.ts
  if (reason && typeof reason === 'object' && 'issues' in reason) {
    // Check if this is from env.test.ts by checking the stack trace
    // Safely access stack property - ZodError may have a stack property
    const stack = (reason instanceof Error ? reason.stack : (reason as any).stack) || ''
    if (stack.includes('env.test.ts') || stack.includes('lib/env.ts')) {
      // This is an expected error from env validation tests - ignore it
      return
    }
  }
  // For other unhandled rejections, let them propagate (Vitest will handle them)
}

beforeEach(() => {
  if (
    typeof process !== 'undefined' &&
    typeof process.on === 'function' &&
    typeof process.listeners === 'function'
  ) {
    const listeners = process.listeners('unhandledRejection')
    if (!listeners.includes(rejectionHandler as (...args: any[]) => void)) {
      process.on('unhandledRejection', rejectionHandler)
    }
  }
})

afterEach(() => {
  if (
    typeof process !== 'undefined' &&
    typeof process.off === 'function'
  ) {
    process.off('unhandledRejection', rejectionHandler)
  }
  vi.restoreAllMocks()
  vi.clearAllTimers()
})
