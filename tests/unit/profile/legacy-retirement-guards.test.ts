import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const legacyFromProfiles = /\.from\(['"]profiles['"]\)/

/** lootaura_v2.profiles via getRlsDb — not public.profiles */
const ALLOWED_LIB_FILES = new Set([
  join('lib', 'profile', 'ensureLootauraProfile.ts'),
])

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

function relativeFromCwd(file: string): string {
  const root = process.cwd()
  return file.startsWith(root) ? file.slice(root.length + 1).replace(/\\/g, '/') : file
}

describe('Phase 7 legacy retirement guards', () => {
  it('app/ has no .from("profiles") (legacy public.profiles)', () => {
    const appRoot = join(process.cwd(), 'app')
    const offenders = walk(appRoot).filter((file) =>
      legacyFromProfiles.test(readFileSync(file, 'utf8'))
    )
    expect(offenders.map(relativeFromCwd)).toEqual([])
  })

  it('lib/ only uses .from("profiles") in ensureLootauraProfile (v2 schema client)', () => {
    const libRoot = join(process.cwd(), 'lib')
    const offenders = walk(libRoot).filter((file) => {
      const rel = relativeFromCwd(file)
      if (ALLOWED_LIB_FILES.has(rel)) return false
      return legacyFromProfiles.test(readFileSync(file, 'utf8'))
    })
    expect(offenders.map(relativeFromCwd)).toEqual([])
  })
})
