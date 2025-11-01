import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isTestSalesEnabled } from '@/lib/flags'

describe('isTestSalesEnabled', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_ENABLE_TEST_SALES
    delete process.env.ENABLE_TEST_SALES
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  it('returns false by default', () => {
    expect(isTestSalesEnabled()).toBe(false)
  })

  it('returns true when NEXT_PUBLIC_ENABLE_TEST_SALES is "true"', () => {
    process.env.NEXT_PUBLIC_ENABLE_TEST_SALES = 'true'
    expect(isTestSalesEnabled()).toBe(true)
  })

  it('returns false when NEXT_PUBLIC_ENABLE_TEST_SALES is not "true"', () => {
    process.env.NEXT_PUBLIC_ENABLE_TEST_SALES = 'false'
    expect(isTestSalesEnabled()).toBe(false)

    process.env.NEXT_PUBLIC_ENABLE_TEST_SALES = '1'
    expect(isTestSalesEnabled()).toBe(false)

    process.env.NEXT_PUBLIC_ENABLE_TEST_SALES = ''
    expect(isTestSalesEnabled()).toBe(false)
  })

  it('returns true when ENABLE_TEST_SALES is "true"', () => {
    process.env.ENABLE_TEST_SALES = 'true'
    expect(isTestSalesEnabled()).toBe(true)
  })

  it('prioritizes NEXT_PUBLIC_ENABLE_TEST_SALES over ENABLE_TEST_SALES', () => {
    process.env.NEXT_PUBLIC_ENABLE_TEST_SALES = 'true'
    process.env.ENABLE_TEST_SALES = 'false'
    expect(isTestSalesEnabled()).toBe(true)

    process.env.NEXT_PUBLIC_ENABLE_TEST_SALES = 'false'
    process.env.ENABLE_TEST_SALES = 'true'
    expect(isTestSalesEnabled()).toBe(false)
  })
})

