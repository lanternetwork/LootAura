import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
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

  it('app routes do not query legacy public.profiles table', () => {
    const legacyFromProfiles = /\.from\(['"]profiles['"]\)/
    const appRoot = join(process.cwd(), 'app')

    function walk(dir: string): string[] {
      const paths: string[] = []
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
          paths.push(...walk(full))
        } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
          paths.push(full)
        }
      }
      return paths
    }

    const offenders = walk(appRoot).filter((file) =>
      legacyFromProfiles.test(readFileSync(file, 'utf8'))
    )
    expect(offenders).toEqual([])
  })
})
