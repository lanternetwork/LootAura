import { describe, it, expect } from 'vitest'
import type { User } from '@supabase/supabase-js'
import {
  canChangePasswordInApp,
  collectAuthProviders,
  getOAuthPasswordManagedMessage,
} from '@/lib/auth/authProviders'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    created_at: '2024-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: {},
    identities: [],
    ...overrides,
  } as User
}

describe('authProviders', () => {
  describe('collectAuthProviders', () => {
    it('collects providers from identities and app_metadata', () => {
      const user = makeUser({
        identities: [
          { provider: 'email', id: '1', user_id: 'user-1', identity_id: '1' } as any,
          { provider: 'google', id: '2', user_id: 'user-1', identity_id: '2' } as any,
        ],
        app_metadata: { providers: ['email'] },
      })

      expect(collectAuthProviders(user)).toEqual(new Set(['email', 'google']))
    })
  })

  describe('canChangePasswordInApp', () => {
    it('returns true for email-only users', () => {
      const user = makeUser({
        identities: [{ provider: 'email' } as any],
      })
      expect(canChangePasswordInApp(user)).toBe(true)
    })

    it('returns true for mixed email and Google users', () => {
      const user = makeUser({
        identities: [{ provider: 'email' } as any, { provider: 'google' } as any],
      })
      expect(canChangePasswordInApp(user)).toBe(true)
    })

    it('returns false for Google-only users', () => {
      const user = makeUser({
        identities: [{ provider: 'google' } as any],
        app_metadata: { providers: ['google'] },
      })
      expect(canChangePasswordInApp(user)).toBe(false)
    })
  })

  describe('getOAuthPasswordManagedMessage', () => {
    it('returns Google-specific copy for Google-only users', () => {
      const user = makeUser({
        identities: [{ provider: 'google' } as any],
      })
      expect(getOAuthPasswordManagedMessage(user)).toBe(
        'Signed in with Google. Your password is managed by Google.'
      )
    })
  })
})
