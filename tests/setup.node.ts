import { beforeAll, afterAll } from 'vitest'

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

beforeAll(() => {
  if (
    typeof process !== 'undefined' &&
    typeof process.on === 'function'
  ) {
    process.on('unhandledRejection', rejectionHandler)
  }
})

afterAll(() => {
  if (
    typeof process !== 'undefined' &&
    typeof process.off === 'function'
  ) {
    process.off('unhandledRejection', rejectionHandler)
  }
})
