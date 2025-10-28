import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/load-test/route'

// Mock child_process to prevent actual process spawning
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn()
  }))
}))

describe('Admin Load Test API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 403 Forbidden in production environment', async () => {
    // Mock production environment
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

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
      process.env.NODE_ENV = originalEnv
    }
  })

  it('should allow load testing in development environment', async () => {
    // Mock development environment
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

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
      process.env.NODE_ENV = originalEnv
    }
  })

  it('should allow load testing in test environment', async () => {
    // Mock test environment
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'

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
      process.env.NODE_ENV = originalEnv
    }
  })

  it('should validate scenario parameter', async () => {
    // Mock development environment
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

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
      process.env.NODE_ENV = originalEnv
    }
  })

  it('should handle missing scenario parameter', async () => {
    // Mock development environment
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

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
      process.env.NODE_ENV = originalEnv
    }
  })
})
