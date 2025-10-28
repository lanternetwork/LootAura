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

describe('Admin Load Test API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 403 Forbidden only in actual production environment', async () => {
    // Mock actual production environment
    const originalNodeEnv = process.env.NODE_ENV
    const originalVercelEnv = process.env.VERCEL_ENV
    
    // Use Object.defineProperty to override read-only properties
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true })
    Object.defineProperty(process.env, 'VERCEL_ENV', { value: 'production', configurable: true })

    try {
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
    } finally {
      // Restore original environment
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalNodeEnv, configurable: true })
      Object.defineProperty(process.env, 'VERCEL_ENV', { value: originalVercelEnv, configurable: true })
    }
  })

  it('should allow load testing in staging/preview environment', async () => {
    // Mock staging environment (production build but not production deployment)
    const originalNodeEnv = process.env.NODE_ENV
    const originalVercelEnv = process.env.VERCEL_ENV
    
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true })
    Object.defineProperty(process.env, 'VERCEL_ENV', { value: 'preview', configurable: true })

    try {
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
    } finally {
      // Restore original environment
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalNodeEnv, configurable: true })
      Object.defineProperty(process.env, 'VERCEL_ENV', { value: originalVercelEnv, configurable: true })
    }
  })

  it('should allow load testing in development environment', async () => {
    // Mock development environment
    const originalEnv = process.env.NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })

    try {
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
    } finally {
      // Restore original environment
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true })
    }
  })

  it('should allow load testing in test environment', async () => {
    // Mock test environment
    const originalEnv = process.env.NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', configurable: true })

    try {
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
    } finally {
      // Restore original environment
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true })
    }
  })

  it('should validate scenario parameter', async () => {
    // Mock development environment
    const originalEnv = process.env.NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })

    try {
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
    } finally {
      // Restore original environment
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true })
    }
  })

  it('should handle missing scenario parameter', async () => {
    // Mock development environment
    const originalEnv = process.env.NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })

    try {
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
    } finally {
      // Restore original environment
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true })
    }
  })
})
