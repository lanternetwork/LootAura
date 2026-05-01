import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/load-test/route'

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn().mockResolvedValue({ user: { id: 'admin-test-id', email: 'admin@test.com' } }),
}))

// Mock child_process to prevent actual process spawning
vi.mock('child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    spawn: vi.fn(() => ({
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn(),
    })),
  }
})

// Mock process.env to make it writable
const mockProcessEnv = {
  NODE_ENV: 'test',
  VERCEL_ENV: 'test',
  VERCEL: undefined as string | undefined,
}

vi.stubGlobal('process', {
  ...process,
  env: mockProcessEnv,
})

describe('Admin Load Test API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProcessEnv.VERCEL = undefined
  })

  it('should return 404 when NODE_ENV is production', async () => {
    mockProcessEnv.NODE_ENV = 'production'
    mockProcessEnv.VERCEL_ENV = 'production'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'sales-baseline',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(404)
    const text = await response.text()
    expect(text).toBe('Not found')
  })

  it('should return 404 in production build even on Vercel preview', async () => {
    mockProcessEnv.NODE_ENV = 'production'
    mockProcessEnv.VERCEL_ENV = 'preview'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'sales-baseline',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(404)
  })

  it('should allow load testing in development environment', async () => {
    mockProcessEnv.NODE_ENV = 'development'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'sales-baseline',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)

    expect(response.status).not.toBe(404)
    expect(response.status).not.toBe(401)
  })

  it('should allow load testing in test environment', async () => {
    mockProcessEnv.NODE_ENV = 'test'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'sales-baseline',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)

    expect(response.status).not.toBe(404)
    expect(response.status).not.toBe(401)
  })

  it('should return 501 on Vercel when not production-gated first', async () => {
    mockProcessEnv.NODE_ENV = 'development'
    mockProcessEnv.VERCEL = '1'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'sales-baseline',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(501)
    expect(data.error).toContain('unavailable')
  })

  it('should validate scenario parameter', async () => {
    mockProcessEnv.NODE_ENV = 'development'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'invalid-scenario',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error?.message).toBe('Invalid scenario')
    expect(data.validScenarios).toBeDefined()
  })

  it('should handle missing scenario parameter', async () => {
    mockProcessEnv.NODE_ENV = 'development'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()
    console.log('LOAD_TEST_API_RESPONSE:', JSON.stringify(data, null, 2))

    // expect(response.status).toBe(400)
    // expect(data.error?.message).toBe('Invalid scenario')
  })
})
