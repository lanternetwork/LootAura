/**
 * Integration tests for Email Diagnostics admin endpoint
 * 
 * Tests the email diagnostics endpoint authentication and response structure
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the admin auth helper
vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

// Mock the email config module
vi.mock('@/lib/config/email', () => ({
  FAVORITE_SALE_STARTING_SOON_ENABLED: true,
  FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START: 24,
  getSellerWeeklyAnalyticsEnabled: () => true,
}))

describe('GET /api/admin/email/diagnostics', () => {
  let handler: (request: NextRequest) => Promise<Response>
  let assertAdminOrThrow: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Import the handler dynamically after mocks are set up
    const module = await import('@/app/api/admin/email/diagnostics/route')
    handler = module.GET
    
    // Get the mocked function
    const adminGate = await import('@/lib/auth/adminGate')
    assertAdminOrThrow = vi.mocked(adminGate.assertAdminOrThrow)
    
    // Set default env vars for tests
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
    process.env.RESEND_API_KEY = 'test-resend-key'
    process.env.RESEND_FROM_EMAIL = 'test@example.com'
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example.com'
    process.env.NODE_ENV = 'test'
  })

  it('should return 403 when not authenticated as admin', async () => {
    const request = new NextRequest('http://localhost/api/admin/email/diagnostics', {
      method: 'GET',
    })

    // Mock auth failure
    assertAdminOrThrow.mockRejectedValue(new Error('Unauthorized'))

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.ok).toBe(false)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return diagnostics when authenticated as admin', async () => {
    const request = new NextRequest('http://localhost/api/admin/email/diagnostics', {
      method: 'GET',
    })

    // Mock auth success
    assertAdminOrThrow.mockResolvedValue(undefined)

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.diagnostics).toBeDefined()
    expect(data.diagnostics.configuration).toBeDefined()
    expect(data.diagnostics.featureFlags).toBeDefined()
    expect(data.diagnostics.environment).toBeDefined()
  })

  it('should include correct configuration values', async () => {
    const request = new NextRequest('http://localhost/api/admin/email/diagnostics', {
      method: 'GET',
    })

    assertAdminOrThrow.mockResolvedValue(undefined)

    const response = await handler(request)
    const data = await response.json()

    expect(data.diagnostics.configuration.emailsEnabled).toBe(true)
    expect(data.diagnostics.configuration.resendApiKeyPresent).toBe(true)
    expect(data.diagnostics.configuration.resendFromEmail).toBe('test@example.com')
    expect(data.diagnostics.configuration.cronSecretPresent).toBe(true)
    expect(data.diagnostics.configuration.siteUrl).toBe('https://test.example.com')
  })

  it('should include correct feature flags', async () => {
    const request = new NextRequest('http://localhost/api/admin/email/diagnostics', {
      method: 'GET',
    })

    assertAdminOrThrow.mockResolvedValue(undefined)

    const response = await handler(request)
    const data = await response.json()

    expect(data.diagnostics.featureFlags.favoriteSaleStartingSoonEnabled).toBe(true)
    expect(data.diagnostics.featureFlags.favoriteSaleStartingSoonHoursBeforeStart).toBe(24)
    expect(data.diagnostics.featureFlags.sellerWeeklyAnalyticsEnabled).toBe(true)
  })

  it('should handle missing environment variables', async () => {
    // Clear env vars
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM_EMAIL
    delete process.env.CRON_SECRET
    delete process.env.NEXT_PUBLIC_SITE_URL

    const request = new NextRequest('http://localhost/api/admin/email/diagnostics', {
      method: 'GET',
    })

    assertAdminOrThrow.mockResolvedValue(undefined)

    const response = await handler(request)
    const data = await response.json()

    expect(data.diagnostics.configuration.resendApiKeyPresent).toBe(false)
    expect(data.diagnostics.configuration.resendFromEmail).toBeNull()
    expect(data.diagnostics.configuration.cronSecretPresent).toBe(false)
    expect(data.diagnostics.configuration.siteUrl).toBeNull()
  })

  it('should use EMAIL_FROM as fallback for RESEND_FROM_EMAIL', async () => {
    delete process.env.RESEND_FROM_EMAIL
    process.env.EMAIL_FROM = 'fallback@example.com'

    const request = new NextRequest('http://localhost/api/admin/email/diagnostics', {
      method: 'GET',
    })

    assertAdminOrThrow.mockResolvedValue(undefined)

    const response = await handler(request)
    const data = await response.json()

    expect(data.diagnostics.configuration.emailFrom).toBe('fallback@example.com')
  })

  it('should detect production environment', async () => {
    process.env.NODE_ENV = 'production'

    const request = new NextRequest('http://localhost/api/admin/email/diagnostics', {
      method: 'GET',
    })

    assertAdminOrThrow.mockResolvedValue(undefined)

    const response = await handler(request)
    const data = await response.json()

    expect(data.diagnostics.environment.nodeEnv).toBe('production')
    expect(data.diagnostics.environment.isProduction).toBe(true)
  })
})

