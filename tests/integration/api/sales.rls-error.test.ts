/**
 * Integration tests for /api/sales POST handler RLS error handling
 * Tests that RLS/permission errors return 403 PERMISSION_DENIED instead of generic 500
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/sales/route'

// Mock Supabase clients
const mockSupabaseClient = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn().mockResolvedValue({ 
      data: { user: { id: 'test-user-id' } }, 
      error: null 
    }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token', user: { id: 'test-user-id' } } },
      error: null,
    }),
  },
}

const mockRlsDb = {
  from: vi.fn(),
}

// Use vi.hoisted() to ensure variables are available when vi.mock is hoisted
const { mockFromBase } = vi.hoisted(() => ({
  mockFromBase: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
  fromBase: mockFromBase,
}))

// Mock CSRF check
vi.mock('@/lib/api/csrfCheck', () => ({
  checkCsrfIfRequired: vi.fn().mockResolvedValue(null),
}))

// Mock account lock check
vi.mock('@/lib/auth/accountLock', () => ({
  isAccountLocked: vi.fn().mockResolvedValue(false),
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  generateOperationId: () => 'test-op-id',
}))

// Mock rate limiting
vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler,
}))

// Mock image validation
vi.mock('@/lib/images/validateImageUrl', () => ({
  isAllowedImageUrl: vi.fn(() => true),
}))

describe('POST /api/sales - RLS Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFromBase.mockReset()
  })

  it('returns 403 PERMISSION_DENIED for RLS error code 42501', async () => {
    // Mock the insert chain to return RLS error
    const mockInsertChain = {
      insert: vi.fn(() => mockInsertChain),
      select: vi.fn(() => mockInsertChain),
      single: vi.fn(() => Promise.resolve({
        data: null,
        error: { code: '42501', message: 'new row violates row-level security policy' },
      })),
    }
    
    mockFromBase.mockReturnValue(mockInsertChain)

    const requestBody = {
      title: 'Test Sale',
      city: 'Test City',
      state: 'TS',
      address: '123 Test St',
      date_start: '2024-01-01',
      time_start: '10:00',
      lat: 40.7128,
      lng: -74.0060,
    }

    const request = new NextRequest('http://localhost/api/sales', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json).toMatchObject({
      ok: false,
      code: 'PERMISSION_DENIED',
      error: 'permission_denied',
    })
    expect(json.details).toBeDefined()
    expect(json.details.message).toContain('Permission denied')
  })

  it('returns 403 PERMISSION_DENIED for PGRST301 error code', async () => {
    // Mock the insert chain to return PGRST301 error
    const mockInsertChain = {
      insert: vi.fn(() => mockInsertChain),
      select: vi.fn(() => mockInsertChain),
      single: vi.fn(() => Promise.resolve({
        data: null,
        error: { code: 'PGRST301', message: 'permission denied' },
      })),
    }
    
    mockFromBase.mockReturnValue(mockInsertChain)

    const requestBody = {
      title: 'Test Sale',
      city: 'Test City',
      state: 'TS',
      address: '123 Test St',
      date_start: '2024-01-01',
      time_start: '10:00',
      lat: 40.7128,
      lng: -74.0060,
    }

    const request = new NextRequest('http://localhost/api/sales', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.code).toBe('PERMISSION_DENIED')
  })

  it('returns 403 PERMISSION_DENIED for error message containing "permission denied"', async () => {
    // Mock the insert chain to return error with permission denied message
    const mockInsertChain = {
      insert: vi.fn(() => mockInsertChain),
      select: vi.fn(() => mockInsertChain),
      single: vi.fn(() => Promise.resolve({
        data: null,
        error: { message: 'permission denied for table sales' },
      })),
    }
    
    mockFromBase.mockReturnValue(mockInsertChain)

    const requestBody = {
      title: 'Test Sale',
      city: 'Test City',
      state: 'TS',
      address: '123 Test St',
      date_start: '2024-01-01',
      time_start: '10:00',
      lat: 40.7128,
      lng: -74.0060,
    }

    const request = new NextRequest('http://localhost/api/sales', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.code).toBe('PERMISSION_DENIED')
  })

  it('returns 500 SALE_CREATE_FAILED for non-RLS errors', async () => {
    // Mock the insert chain to return a non-RLS error
    const mockInsertChain = {
      insert: vi.fn(() => mockInsertChain),
      select: vi.fn(() => mockInsertChain),
      single: vi.fn(() => Promise.resolve({
        data: null,
        error: { code: 'PGRST204', message: 'Column does not exist' },
      })),
    }
    
    mockFromBase.mockReturnValue(mockInsertChain)

    const requestBody = {
      title: 'Test Sale',
      city: 'Test City',
      state: 'TS',
      address: '123 Test St',
      date_start: '2024-01-01',
      time_start: '10:00',
      lat: 40.7128,
      lng: -74.0060,
    }

    const request = new NextRequest('http://localhost/api/sales', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.code).toBe('SALE_CREATE_FAILED')
  })
})
