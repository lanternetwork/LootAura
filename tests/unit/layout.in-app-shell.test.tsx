/**
 * Regression: in-app body background (in-app-shell) is gated by isInAppUserAgent;
 * normal web must not get the splash-colored background.
 * Uses source-based assertions so the test is stable across React/Next/env.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

function resolveLayoutPath(): string {
  const fromCwd = path.resolve(process.cwd(), 'app/layout.tsx')
  if (fs.existsSync(fromCwd)) return fromCwd
  const fromDir = path.resolve(__dirname, '../../app/layout.tsx')
  return fromDir
}

const LAYOUT_PATH = resolveLayoutPath()

describe('Layout in-app shell (body background gating)', () => {
  it('body has in-app-shell only when inApp is true (gated by isInAppUserAgent)', () => {
    const layout = fs.readFileSync(LAYOUT_PATH, 'utf-8')
    expect(layout).toContain('isInAppUserAgent')
    expect(layout).toContain('in-app-shell')
    expect(layout).toContain('user-agent')
    expect(layout).toMatch(/inApp[\s\S]*?in-app-shell/)
  })

  it('normal web path uses default body class without in-app-shell', () => {
    const layout = fs.readFileSync(LAYOUT_PATH, 'utf-8')
    expect(layout).toContain('min-h-screen bg-neutral-50 text-neutral-900')
    expect(layout).toContain('inApp')
    expect(layout).toMatch(/inApp\s*\?[\s\S]*?:[\s\S]*?min-h-screen/)
  })
})
