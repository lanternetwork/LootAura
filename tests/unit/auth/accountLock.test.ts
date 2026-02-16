/**
 * Unit tests for account lock helper functions
 * Tests the logic for checking if an account is locked
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isAccountLocked, assertAccountNotLocked } from '@/lib/auth/accountLock'

// Create chainable mock for supabase client
const createProfileChain = (data: any, error: any = null) => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error })),
  }
  return chain
}

// Mock the database clients
const mockRlsDb = {
  from: vi.fn(),
}

const mockAdminDb = {
  from: vi.fn(),
}

// Mock the clients module
vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: vi.fn(() => {
    // Simulate cookies() error in test environment - this triggers fallback to getAdminDb
    throw new Error('cookies() can only be called inside a Server Component or Route Handler')
  }),
  getAdminDb: vi.fn(() => mockAdminDb),
  fromBase: (db: any, table: string) => {
    // Use the db's from method
    return db.from(table)
  },
}))

// Mock the logger
const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}

vi.mock('@/lib/log', () => ({
  logger: mockLogger,
}))

describe('isAccountLocked', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminDb.from.mockReset()
  })

  it('returns true when profile exists and is_locked === true', async () => {
    const userId = 'test-user-id-123'
    const profile = { is_locked: true }
    
    mockAdminDb.from.mockReturnValue(createProfileChain(profile, null))

    const result = await isAccountLocked(userId)
    
    expect(result).toBe(true)
    expect(mockAdminDb.from).toHaveBeenCalledWith('profiles')
  })

  it('returns false when profile exists and is_locked === false', async () => {
    const userId = 'test-user-id-123'
    const profile = { is_locked: false }
    
    mockAdminDb.from.mockReturnValue(createProfileChain(profile, null))

    const result = await isAccountLocked(userId)
    
    expect(result).toBe(false)
  })

  it('returns false when profile row is missing (new user)', async () => {
    const userId = 'test-user-id-123'
    
    mockAdminDb.from.mockReturnValue(createProfileChain(null, null))

    const result = await isAccountLocked(userId)
    
    expect(result).toBe(false)
    expect(mockLogger.error).not.toHaveBeenCalled()
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  it('returns false when query returns an error (fail open)', async () => {
    const userId = 'test-user-id-123'
    const queryError = { message: 'Permission denied', code: 'PGRST301' }
    
    mockAdminDb.from.mockReturnValue(createProfileChain(null, queryError))

    const result = await isAccountLocked(userId)
    
    expect(result).toBe(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to check account lock status',
      expect.any(Error),
      expect.objectContaining({
        component: 'accountLock',
        operation: 'isAccountLocked',
        userId: 'test-use...',
      })
    )
  })

  it('returns false when query error occurs and logs with userId prefix only', async () => {
    const userId = 'test-user-id-1234567890'
    const queryError = { message: 'Database connection failed', code: 'NETWORK_ERROR' }
    
    mockRlsDb.from.mockReturnValue(
      makeThenableQuery({
        data: null,
        error: queryError,
      })
    )

    const result = await isAccountLocked(userId)
    
    expect(result).toBe(false)
    // Verify only first 8 chars of userId are logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Error),
      expect.objectContaining({
        userId: 'test-use...',
      })
    )
    // Verify full userId is NOT logged
    const logCall = mockLogger.error.mock.calls[0]
    expect(JSON.stringify(logCall)).not.toContain('test-user-id-1234567890')
  })

  it('returns false when client cannot be obtained (fail open)', async () => {
    const userId = 'test-user-id-123'
    
    // Mock getAdminDb to throw
    const { getAdminDb } = await import('@/lib/supabase/clients')
    vi.mocked(getAdminDb).mockImplementationOnce(() => {
      throw new Error('Service role key missing')
    })

    const result = await isAccountLocked(userId)
    
    expect(result).toBe(false)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Could not get database client for account lock check, assuming not locked',
      expect.objectContaining({
        component: 'accountLock',
        operation: 'isAccountLocked',
        userId: 'test-use...',
      })
    )
  })

  it('returns false when unexpected error occurs in try-catch (fail open)', async () => {
    const userId = 'test-user-id-123'
    
    // Mock fromBase to throw by making from() throw
    mockAdminDb.from.mockImplementation(() => {
      throw new Error('Unexpected database error')
    })

    const result = await isAccountLocked(userId)
    
    expect(result).toBe(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Unexpected error in isAccountLocked',
      expect.any(Error),
      expect.objectContaining({
        component: 'accountLock',
        operation: 'isAccountLocked',
        userId: 'test-use...',
      })
    )
  })

  it('uses provided db client when passed as parameter', async () => {
    const userId = 'test-user-id-123'
    const profile = { is_locked: true }
    const customDb = {
      from: vi.fn().mockReturnValue(createProfileChain(profile, null)),
    }
    
    const result = await isAccountLocked(userId, customDb as any)
    
    expect(result).toBe(true)
    expect(customDb.from).toHaveBeenCalledWith('profiles')
    expect(mockAdminDb.from).not.toHaveBeenCalled()
  })
})

describe('assertAccountNotLocked', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminDb.from.mockReset()
  })

  it('does not throw when profile exists and is_locked === false', async () => {
    const userId = 'test-user-id-123'
    const profile = { is_locked: false }
    
    mockAdminDb.from.mockReturnValue(createProfileChain(profile, null))

    await expect(assertAccountNotLocked(userId)).resolves.toBeUndefined()
  })

  it('does not throw when profile row is missing (new user)', async () => {
    const userId = 'test-user-id-123'
    
    mockAdminDb.from.mockReturnValue(createProfileChain(null, null))

    await expect(assertAccountNotLocked(userId)).resolves.toBeUndefined()
  })

  it('throws ACCOUNT_LOCKED when profile exists and is_locked === true', async () => {
    const userId = 'test-user-id-123'
    const profile = { is_locked: true }
    
    mockAdminDb.from.mockReturnValue(createProfileChain(profile, null))

    // assertAccountNotLocked throws a NextResponse when locked
    await expect(assertAccountNotLocked(userId)).rejects.toBeDefined()
  })

  it('does not throw when query returns an error (fail open)', async () => {
    const userId = 'test-user-id-123'
    const queryError = { message: 'Permission denied', code: 'PGRST301' }
    
    mockAdminDb.from.mockReturnValue(createProfileChain(null, queryError))

    await expect(assertAccountNotLocked(userId)).resolves.toBeUndefined()
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to check account lock status',
      expect.any(Error),
      expect.objectContaining({
        component: 'accountLock',
        operation: 'assertAccountNotLocked',
        userId: 'test-use...',
      })
    )
  })
})
