import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/load-test/route'

// Mock child_process to prevent actual process spawning
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    spawn: vi.fn(() => ({
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn()
    }))
  }
})

// Mock process.env to make it writable, but preserve required env vars from test setup
// The test setup in tests/setup.ts sets defaults for NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
// We need to preserve those to avoid ZodError when lib/env.ts is imported
const mockProcessEnv = {
  ...process.env, // Preserve existing env vars (including defaults from test setup)
  NODE_ENV: 'test',
  VERCEL_ENV: 'test'
}

vi.stubGlobal('process', {
  ...process,
  env: mockProcessEnv
})

describe('Admin Load Test API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 403 Forbidden only in actual production environment', async () => {
    // Mock actual production environment
    mockProcessEnv.NODE_ENV = 'production'
    mockProcessEnv.VERCEL_ENV = 'production'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'sales-baseline',
        baseURL: 'http://localhost:3000'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Load testing is disabled in production environment')
  })

  it('should allow load testing in staging/preview environment', async () => {
    // Mock staging environment (production build but not production deployment)
    mockProcessEnv.NODE_ENV = 'production'
    mockProcessEnv.VERCEL_ENV = 'preview'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'sales-baseline',
        baseURL: 'http://localhost:3000'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const response = await POST(request)
    
    // In staging/preview, it should not return 403
    expect(response.status).not.toBe(403)
  })

  it('should allow load testing in development environment', async () => {
    // Mock development environment
    mockProcessEnv.NODE_ENV = 'development'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'sales-baseline',
        baseURL: 'http://localhost:3000'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const response = await POST(request)
    
    // In development, it should not return 403
    expect(response.status).not.toBe(403)
  })

  it('should allow load testing in test environment', async () => {
    // Mock test environment
    mockProcessEnv.NODE_ENV = 'test'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'sales-baseline',
        baseURL: 'http://localhost:3000'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const response = await POST(request)
    
    // In test, it should not return 403
    expect(response.status).not.toBe(403)
  })

  it('should validate scenario parameter', async () => {
    // Mock development environment
    mockProcessEnv.NODE_ENV = 'development'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'invalid-scenario',
        baseURL: 'http://localhost:3000'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid scenario')
    expect(data.validScenarios).toBeDefined()
  })

  it('should handle missing scenario parameter', async () => {
    // Mock development environment
    mockProcessEnv.NODE_ENV = 'development'

    const request = new NextRequest('http://localhost:3000/api/admin/load-test', {
      method: 'POST',
      body: JSON.stringify({
        baseURL: 'http://localhost:3000'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid scenario')
  })
})
