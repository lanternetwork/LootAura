import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

function read(filePath: string): string {
  const full = path.resolve(process.cwd(), filePath)
  return fs.readFileSync(full, 'utf-8')
}

describe('PWA install CTA gating', () => {
  it('does not use viewport width as installability proxy', () => {
    const source = read('components/PWAInstallPrompt.tsx')
    expect(source).not.toContain('window.innerWidth')
    expect(source).not.toContain('md:hidden')
  })

  it('uses centralized PWA platform hook', () => {
    const source = read('components/PWAInstallPrompt.tsx')
    expect(source).toContain('usePWAPlatform')
    expect(source).toContain('showAndroidInstallCta')
    expect(source).toContain('showIosInstallHelper')
  })
})
