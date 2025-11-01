import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isTestSalesEnabled } from '@/lib/flags'

describe('isTestSalesEnabled', () => {
  beforeEach(() => {
    // Clear environment variables before each test
    vi.stubEnv('NEXT_PUBLIC_ENABLE_TEST_SALES', undefined)
    vi.stubEnv('ENABLE_TEST_SALES', undefined)
  })

  afterEach(() => {
    // Restore original environment
    vi.unstubAllEnvs()
  })

  it('returns false by default', () => {
    expect(isTestSalesEnabled()).toBe(false)
  })

  it('returns true when NEXT_PUBLIC_ENABLE_TEST_SALES is "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_TEST_SALES', 'true')
    expect(isTestSalesEnabled()).toBe(true)
  })

  it('returns false when NEXT_PUBLIC_ENABLE_TEST_SALES is not "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_TEST_SALES', 'false')
    expect(isTestSalesEnabled()).toBe(false)

    vi.stubEnv('NEXT_PUBLIC_ENABLE_TEST_SALES', '1')
    expect(isTestSalesEnabled()).toBe(false)

    vi.stubEnv('NEXT_PUBLIC_ENABLE_TEST_SALES', '')
    expect(isTestSalesEnabled()).toBe(false)
  })

  it('returns true when ENABLE_TEST_SALES is "true"', () => {
    vi.stubEnv('ENABLE_TEST_SALES', 'true')
    expect(isTestSalesEnabled()).toBe(true)
  })

  it('prioritizes NEXT_PUBLIC_ENABLE_TEST_SALES over ENABLE_TEST_SALES', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_TEST_SALES', 'true')
    vi.stubEnv('ENABLE_TEST_SALES', 'false')
    expect(isTestSalesEnabled()).toBe(true)

    vi.stubEnv('NEXT_PUBLIC_ENABLE_TEST_SALES', 'false')
    vi.stubEnv('ENABLE_TEST_SALES', 'true')
    expect(isTestSalesEnabled()).toBe(false)
  })
})

