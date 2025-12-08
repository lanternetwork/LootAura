/**
 * Integration tests for email unsubscribe endpoint
 * 
 * Tests the /email/unsubscribe route with various token scenarios
 * and rate limiting behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/email/unsubscribe/route'

// Mock Supabase clients
const mockFromBase = vi.fn()
const mockAdminDb = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => mockFromBase(db, table),
}))

// Mock rate limiting
const mockDeriveKey = vi.fn()
const mockCheck = vi.fn()
const mockShouldBypassRateLimit = vi.fn()

vi.mock('@/lib/rateLimit/keys', () => ({
  deriveKey: (req: any, scope: any) => mockDeriveKey(req, scope),
}))

vi.mock('@/lib/rateLimit/limiter', () => ({
  check: (policy: any, key: string) => mockCheck(policy, key),
}))

vi.mock('@/lib/rateLimit/config', () => ({
  shouldBypassRateLimit: () => mockShouldBypassRateLimit(),
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

describe('GET /email/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://test.example.com')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    
    // Default: rate limiting enabled (not bypassed)
    mockShouldBypassRateLimit.mockReturnValue(false)
    mockDeriveKey.mockResolvedValue('ip:127.0.0.1')
    mockCheck.mockResolvedValue({
      allowed: true,
      softLimited: false,
      remaining: 5,
      resetAt: Date.now() + 900000,
    })
  })

  describe('Valid token scenarios', () => {
    it('should successfully unsubscribe user with valid token', async () => {
      const validToken = 'valid-token-123'
      const profileId = 'profile-123'
      const futureDate = new Date(Date.now() + 86400000).toISOString() // 1 day from now

      // Track call order for fromBase
      let tokenCallCount = 0
      let profileCallCount = 0

      // Mock token lookup - valid token found
      mockFromBase.mockImplementation((db: any, table: string) => {
        if (table === 'email_unsubscribe_tokens') {
          tokenCallCount++
          if (tokenCallCount === 1) {
            // First call: token lookup with full chain
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      gte: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: {
                            profile_id: profileId,
                            used_at: null,
                            expires_at: futureDate,
                          },
                          error: null,
                        }),
                      })),
                    })),
                  })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            }
          } else {
            // Second call: mark token as used
            return {
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            }
          }
        } else if (table === 'profiles') {
          profileCallCount++
          if (profileCallCount === 1) {
            // First call: profile lookup
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      email_favorites_digest_enabled: true,
                      email_seller_weekly_enabled: true,
                    },
                    error: null,
                  }),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            }
          } else {
            // Second call: profile update
            return {
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            }
          }
        }
        return {}
      })

      const request = new NextRequest(
        `http://localhost/email/unsubscribe?token=${validToken}`,
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        }
      )

      const response = await GET(request)
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('You have been successfully unsubscribed')
      expect(html).toContain('unsubscribed from all non-administrative emails')
      
      // Verify profile was updated
      expect(mockFromBase).toHaveBeenCalledWith(mockAdminDb, 'profiles')
    })

    it('should handle already unsubscribed user gracefully', async () => {
      const validToken = 'valid-token-123'
      const profileId = 'profile-123'
      const futureDate = new Date(Date.now() + 86400000).toISOString()

      let tokenCallCount = 0
      let profileCallCount = 0

      mockFromBase.mockImplementation((db: any, table: string) => {
        if (table === 'email_unsubscribe_tokens') {
          tokenCallCount++
          if (tokenCallCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      gte: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: {
                            profile_id: profileId,
                            used_at: null,
                            expires_at: futureDate,
                          },
                          error: null,
                        }),
                      })),
                    })),
                  })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            }
          } else {
            return {
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            }
          }
        } else if (table === 'profiles') {
          profileCallCount++
          if (profileCallCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      email_favorites_digest_enabled: false,
                      email_seller_weekly_enabled: false,
                    },
                    error: null,
                  }),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            }
          } else {
            return {
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            }
          }
        }
        return {}
      })

      const request = new NextRequest(
        `http://localhost/email/unsubscribe?token=${validToken}`,
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        }
      )

      const response = await GET(request)
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('You were already unsubscribed')
    })
  })

  describe('Invalid token scenarios', () => {
    it('should return 400 for missing token', async () => {
      const request = new NextRequest('http://localhost/email/unsubscribe', {
        headers: {
          'x-forwarded-for': '127.0.0.1',
        },
      })

      const response = await GET(request)
      const html = await response.text()

      expect(response.status).toBe(400)
      expect(html).toContain('Invalid unsubscribe link')
      expect(html).toContain('token is missing or malformed')
    })

    it('should return 400 for invalid/expired token', async () => {
      const invalidToken = 'invalid-token'

      let callCount = 0

      // Mock token lookup - no token found
      mockFromBase.mockImplementation((db: any, table: string) => {
        if (table === 'email_unsubscribe_tokens') {
          callCount++
          if (callCount === 1) {
            // First call: token lookup (not found)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      gte: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: null, // Token not found
                          error: null,
                        }),
                      })),
                    })),
                  })),
                })),
              })),
            }
          } else {
            // Second call: check if already used
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                })),
              })),
            }
          }
        }
        return {}
      })

      const request = new NextRequest(
        `http://localhost/email/unsubscribe?token=${invalidToken}`,
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        }
      )

      const response = await GET(request)
      const html = await response.text()

      expect(response.status).toBe(400)
      expect(html).toContain('invalid or has expired')
    })

    it('should return 400 for already used token', async () => {
      const usedToken = 'used-token-123'
      const usedAt = new Date().toISOString()

      let callCount = 0

      mockFromBase.mockImplementation((db: any, table: string) => {
        if (table === 'email_unsubscribe_tokens') {
          callCount++
          if (callCount === 1) {
            // First call: token lookup (not found because used_at is not null)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      gte: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: null, // Token not found (because used_at is not null)
                          error: null,
                        }),
                      })),
                    })),
                  })),
                })),
              })),
            }
          } else {
            // Second call: check if already used
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      used_at: usedAt,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
        }
        return {}
      })

      const request = new NextRequest(
        `http://localhost/email/unsubscribe?token=${usedToken}`,
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        }
      )

      const response = await GET(request)
      const html = await response.text()

      expect(response.status).toBe(400)
      expect(html).toContain('already been used')
    })
  })

  describe('Rate limiting', () => {
    it('should return 429 HTML page when rate limit is exceeded', async () => {
      // Mock rate limit exceeded
      mockCheck.mockResolvedValue({
        allowed: false,
        softLimited: false,
        remaining: 0,
        resetAt: Date.now() + 900000,
      })

      const request = new NextRequest(
        'http://localhost/email/unsubscribe?token=some-token',
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        }
      )

      const response = await GET(request)
      const html = await response.text()

      expect(response.status).toBe(429)
      expect(html).toContain('Too many unsubscribe requests')
      expect(html).toContain('try again later')
      
      // Should not call database
      expect(mockFromBase).not.toHaveBeenCalled()
    })

    it('should allow request when rate limit is not exceeded', async () => {
      // Mock rate limit check passing
      mockCheck.mockResolvedValue({
        allowed: true,
        softLimited: false,
        remaining: 4,
        resetAt: Date.now() + 900000,
      })

      // Mock token lookup - invalid token (to test rate limit doesn't block)
      let callCount = 0
      mockFromBase.mockImplementation((db: any, table: string) => {
        if (table === 'email_unsubscribe_tokens') {
          callCount++
          if (callCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      gte: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: null,
                          error: null,
                        }),
                      })),
                    })),
                  })),
                })),
              })),
            }
          } else {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                })),
              })),
            }
          }
        }
        return {}
      })

      const request = new NextRequest(
        'http://localhost/email/unsubscribe?token=invalid-token',
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        }
      )

      const response = await GET(request)
      const html = await response.text()

      // Should process the request (not rate limited)
      expect(response.status).toBe(400) // Invalid token, not rate limited
      expect(html).toContain('invalid or has expired')
    })

    it('should bypass rate limiting when disabled', async () => {
      mockShouldBypassRateLimit.mockReturnValue(true)

      // Mock token lookup - invalid token
      let callCount = 0
      mockFromBase.mockImplementation((db: any, table: string) => {
        if (table === 'email_unsubscribe_tokens') {
          callCount++
          if (callCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      gte: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: null,
                          error: null,
                        }),
                      })),
                    })),
                  })),
                })),
              })),
            }
          } else {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                })),
              })),
            }
          }
        }
        return {}
      })

      const request = new NextRequest(
        'http://localhost/email/unsubscribe?token=invalid-token',
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        }
      )

      const response = await GET(request)

      // Should not check rate limits
      expect(mockCheck).not.toHaveBeenCalled()
      // Should process the request
      expect(response.status).toBe(400)
    })
  })

  describe('Error handling', () => {
    it('should return 500 HTML page on database lookup error', async () => {
      const validToken = 'valid-token-123'

      mockFromBase.mockImplementation((db: any, table: string) => {
        if (table === 'email_unsubscribe_tokens') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    gte: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: { message: 'Database connection error' },
                      }),
                    })),
                  })),
                })),
              })),
            })),
          }
        }
        return {}
      })

      const request = new NextRequest(
        `http://localhost/email/unsubscribe?token=${validToken}`,
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        }
      )

      const response = await GET(request)
      const html = await response.text()

      expect(response.status).toBe(500)
      expect(html).toContain('error occurred while processing')
    })

    it('should return 500 HTML page on profile update error', async () => {
      const validToken = 'valid-token-123'
      const profileId = 'profile-123'
      const futureDate = new Date(Date.now() + 86400000).toISOString()

      let profileCallCount = 0

      mockFromBase.mockImplementation((db: any, table: string) => {
        if (table === 'email_unsubscribe_tokens') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    gte: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          profile_id: profileId,
                          used_at: null,
                          expires_at: futureDate,
                        },
                        error: null,
                      }),
                    })),
                  })),
                })),
              })),
            })),
          }
        } else if (table === 'profiles') {
          profileCallCount++
          // Return same structure for all profile calls
          // First call uses select, second call uses update
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    email_favorites_digest_enabled: true,
                    email_seller_weekly_enabled: true,
                  },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Update failed' },
              }),
            })),
          }
        }
        return {}
      })

      const request = new NextRequest(
        `http://localhost/email/unsubscribe?token=${validToken}`,
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        }
      )

      const response = await GET(request)
      const html = await response.text()

      expect(response.status).toBe(500)
      expect(html).toContain('error occurred while updating')
    })
  })
})

