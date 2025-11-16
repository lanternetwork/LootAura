import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Environment Validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    // Ensure required server env is present for tests that import lib/env
    process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || 'test-service-role-1234567890'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should validate required public environment variables', async () => {
    // Set up valid environment
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-1234567890'

    const { ENV_PUBLIC } = await import('@/lib/env')

    expect(ENV_PUBLIC.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co')
    expect(ENV_PUBLIC.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('test-anon-key-1234567890')
  })

  it('should validate required server environment variables', async () => {
    // Set up valid environment
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-1234567890'
    process.env.SUPABASE_SERVICE_ROLE = 'test-service-role-1234567890'

    const { ENV_SERVER } = await import('@/lib/env')

    expect(ENV_SERVER.SUPABASE_SERVICE_ROLE).toBe('test-service-role-1234567890')
  })

  it('should throw error for missing required public variables', async () => {
    await vi.isolateModules(async () => {
      // Clear required variables
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      await expect(async () => {
        await import('@/lib/env')
      }).rejects.toThrow()
    })
  })

  it('should throw error for invalid URL format', async () => {
    await vi.isolateModules(async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url'
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-1234567890'

      await expect(async () => {
        await import('@/lib/env')
      }).rejects.toThrow()
    })
  })

  it('should throw error for short API keys', async () => {
    await vi.isolateModules(async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'short'

      await expect(async () => {
        await import('@/lib/env')
      }).rejects.toThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY must be at least 10 characters')
    })
  })

  it('should handle optional environment variables', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-1234567890'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-key-1234567890'

    const { ENV_PUBLIC } = await import('@/lib/env')

    expect(ENV_PUBLIC.NEXT_PUBLIC_SITE_URL).toBe('https://example.com')
    expect(ENV_PUBLIC.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe('test-vapid-key-1234567890')
  })

  it('should handle missing optional variables', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-1234567890'
    process.env.SUPABASE_SERVICE_ROLE = 'test-service-role-1234567890'

    const { ENV_PUBLIC } = await import('@/lib/env')

    // Accept the default value from global mock
    expect(ENV_PUBLIC.NEXT_PUBLIC_SITE_URL).toBe('https://lootaura.app')
    expect(ENV_PUBLIC.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBeUndefined()
  })

  it('should validate email format for NOMINATIM_APP_EMAIL', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-1234567890'
    process.env.SUPABASE_SERVICE_ROLE = 'test-service-role-1234567890'
    process.env.NOMINATIM_APP_EMAIL = 'invalid-email'

    // ENV_SERVER validation is lazy - access ENV_SERVER to trigger validation
    await expect(async () => {
      const { ENV_SERVER } = await import('@/lib/env')
      // Access NOMINATIM_APP_EMAIL to trigger lazy validation
      // This will call getEnvServer() which validates and throws on invalid email
      const email = ENV_SERVER.NOMINATIM_APP_EMAIL
      // Access the email variable to ensure evaluation happens
      if (email) email.toString()
    }).rejects.toThrow('Invalid email')
  })

  it('should accept valid email for NOMINATIM_APP_EMAIL', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-1234567890'
    process.env.SUPABASE_SERVICE_ROLE = 'test-service-role-1234567890'
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'

    const { ENV_SERVER } = await import('@/lib/env')

    expect(ENV_SERVER.NOMINATIM_APP_EMAIL).toBe('test@example.com')
  })
})
