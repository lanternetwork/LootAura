import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Phase 3 guard: /account must not import legacy server actions or public.profiles writes.
 */
describe('Account settings canonical profile path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AccountClient does not import legacy account server actions', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/account/AccountClient.tsx'),
      'utf8'
    )
    expect(source).not.toContain("from './_actions'")
    expect(source).not.toContain("from './_actions.ts'")
    expect(source).toContain('/api/profile/update')
    expect(source).toContain('getCsrfHeaders')
  })

  it('legacy account server actions file is removed', () => {
    let threw = false
    try {
      readFileSync(join(process.cwd(), 'app/account/_actions.ts'), 'utf8')
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it('legacy v2 profiles API route is removed', () => {
    let threw = false
    try {
      readFileSync(join(process.cwd(), 'app/api/v2/profiles/route.ts'), 'utf8')
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it('useAuth does not export useUpdateProfile', () => {
    const source = readFileSync(join(process.cwd(), 'lib/hooks/useAuth.ts'), 'utf8')
    expect(source).not.toMatch(/export function useUpdateProfile/)
    expect(source).not.toContain(".from('profiles')")
  })
})
