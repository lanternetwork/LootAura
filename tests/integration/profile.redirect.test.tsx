/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import ProfilePage from '@/app/(account)/profile/page'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: { id: 'test-user-id' } },
        error: null,
      })),
    },
  })),
}))

describe('Profile Page Redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should redirect to /dashboard#profile when user is authenticated', async () => {
    await ProfilePage()
    
    expect(redirect).toHaveBeenCalledWith('/dashboard#profile')
  })

  it('should redirect to sign-in when user is not authenticated', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => Promise.resolve({
          data: { user: null },
          error: null,
        })),
      },
    } as any)

    await ProfilePage()
    
    expect(redirect).toHaveBeenCalledWith('/auth/signin?redirectTo=/profile')
  })
})

