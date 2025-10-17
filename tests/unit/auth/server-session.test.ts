import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import { setSessionCookies, clearSessionCookies, hasValidSession } from '@/lib/auth/server-session'

// Mock cookies
const mockCookies = {
  get: vi.fn(),
  set: vi.fn(),
  getAll: vi.fn(),
}

describe('Server Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('setSessionCookies', () => {
    it('should set HttpOnly, Secure, SameSite=Strict cookies', () => {
      const response = NextResponse.json({})
      const mockSession = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      }

      setSessionCookies(response, mockSession)

      // Check that cookies were set with correct attributes
      expect(response.cookies.get('sb-access-token')).toBeDefined()
      expect(response.cookies.get('sb-refresh-token')).toBeDefined()
      expect(response.cookies.get('sb-session-expires')).toBeDefined()

      // Verify cookie attributes
      const accessTokenCookie = response.cookies.get('sb-access-token')
      expect(accessTokenCookie?.httpOnly).toBe(true)
      expect(accessTokenCookie?.secure).toBe(process.env.NODE_ENV === 'production')
      expect(accessTokenCookie?.sameSite).toBe('strict')
      expect(accessTokenCookie?.path).toBe('/')
    })

    it('should cap maxAge at 1 hour for access token', () => {
      const response = NextResponse.json({})
      const mockSession = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 7200, // 2 hours from now
      }

      setSessionCookies(response, mockSession)

      const accessTokenCookie = response.cookies.get('sb-access-token')
      expect(accessTokenCookie?.maxAge).toBeLessThanOrEqual(3600)
    })
  })

  describe('clearSessionCookies', () => {
    it('should clear all session cookies', () => {
      const response = NextResponse.json({})

      clearSessionCookies(response)

      // Check that all session cookies are cleared
      const cookiesToCheck = ['sb-access-token', 'sb-refresh-token', 'sb-session-expires']
      
      cookiesToCheck.forEach(cookieName => {
        const cookie = response.cookies.get(cookieName)
        expect(cookie?.maxAge).toBe(0)
        expect(cookie?.expires).toEqual(new Date(0))
      })
    })
  })

  describe('hasValidSession', () => {
    it('should return false when no cookies are present', () => {
      mockCookies.get.mockReturnValue(undefined)

      const result = hasValidSession(mockCookies as any)
      expect(result).toBe(false)
    })

    it('should return false when session is expired', () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      
      mockCookies.get.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'test-token' }
        if (name === 'sb-refresh-token') return { value: 'test-refresh' }
        if (name === 'sb-session-expires') return { value: expiredTimestamp.toString() }
        return undefined
      })

      const result = hasValidSession(mockCookies as any)
      expect(result).toBe(false)
    })

    it('should return true when session is valid', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      
      mockCookies.get.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'test-token' }
        if (name === 'sb-refresh-token') return { value: 'test-refresh' }
        if (name === 'sb-session-expires') return { value: futureTimestamp.toString() }
        return undefined
      })

      const result = hasValidSession(mockCookies as any)
      expect(result).toBe(true)
    })

    it('should return false when expires timestamp is invalid', () => {
      mockCookies.get.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'test-token' }
        if (name === 'sb-refresh-token') return { value: 'test-refresh' }
        if (name === 'sb-session-expires') return { value: 'invalid-timestamp' }
        return undefined
      })

      const result = hasValidSession(mockCookies as any)
      expect(result).toBe(false)
    })
  })
})
